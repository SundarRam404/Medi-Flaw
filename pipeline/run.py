"""Runs the monthly pipeline and keeps a record of every run.

  python3 -m pipeline.run --setup        first time: tables, users, data, models, search index
  python3 -m pipeline.run --monthly      one full monthly run (what n8n triggers)
  python3 -m pipeline.run --step fetch   a single step
"""
import argparse, json, re, traceback
from datetime import datetime, date
import bcrypt
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from .db import utcnow, SessionLocal, init_db, PipelineRun, User, WatchItem
from . import fetch, clean, model, rag, alerts
from .config import ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_EMAIL, DEMO_PASSWORD, INCOMING_DIR

STEPS = ["fetch", "clean", "score", "index", "alerts", "followups"]


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def start_run(trigger: str) -> int:
    with SessionLocal() as s:
        r = PipelineRun(trigger=trigger, steps={})
        s.add(r)
        s.commit()
        return r.id


def _save(run_id, name, data):
    with SessionLocal() as s:
        r = s.get(PipelineRun, run_id)
        r.steps = {**(r.steps or {}), name: data}
        flag_modified(r, "steps")
        s.commit()


def run_step(run_id: int, name: str) -> dict:
    if name not in STEPS:
        raise ValueError(f"unknown step {name}")
    t0 = utcnow()
    with SessionLocal() as s:
        prev = (s.get(PipelineRun, run_id).steps or {})
    try:
        if name == "fetch":
            res = fetch.run(run_id)
        elif name == "clean":
            res = clean.run(run_id)
        elif name == "score":
            res = model.run(run_id)
        elif name == "index":
            res = rag.run(run_id)
        elif name == "alerts":
            ids = prev.get("clean", {}).get("result", {}).get("new_record_ids", [])
            res = alerts.run(run_id, ids)
        else:
            res = alerts.followups(run_id)
        data = {"status": "ok", "result": res, "seconds": round((utcnow() - t0).total_seconds(), 1)}
    except Exception as e:
        data = {"status": "error", "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-1500:]}
    _save(run_id, name, data)
    if data["status"] == "error":
        raise RuntimeError(data["error"])
    return data


def finish_run(run_id: int, status: str = "done", error: str | None = None):
    with SessionLocal() as s:
        r = s.get(PipelineRun, run_id)
        r.status, r.error, r.finished_at = status, error, utcnow()
        s.commit()


def run_all(trigger: str = "manual", run_id: int | None = None) -> int:
    run_id = run_id or start_run(trigger)
    try:
        for st in STEPS:
            run_step(run_id, st)
        finish_run(run_id)
    except Exception as e:
        finish_run(run_id, "failed", str(e))
    return run_id


# ------------------------------------------------------------------ first-time setup
def seed_users():
    with SessionLocal() as s:
        if not s.scalar(select(User).where(User.email == ADMIN_EMAIL)):
            s.add(User(email=ADMIN_EMAIL, name="Admin", organisation="PharmaAudit", role="admin",
                       password_hash=hash_pw(ADMIN_PASSWORD)))
        demo = s.scalar(select(User).where(User.email == DEMO_EMAIL))
        if not demo:
            demo = User(email=DEMO_EMAIL, name="Demo Pharmacy", organisation="Sri Ram Medicals, Chennai",
                        role="pharmacist", password_hash=hash_pw(DEMO_PASSWORD))
            s.add(demo)
            s.flush()
            # two batches from the held-back month, so the monthly run raises alerts in the demo
            picks = []
            for f in sorted(INCOMING_DIR.glob("*.csv")):
                df = pd.read_csv(f, dtype=str)
                picks += df.head(2)[["batch_no", "drug_name"]].values.tolist()
            picks += [["DOLO-SAFE-01", "Paracetamol Tablets IP 650 mg"], ["AZ2611X", "Azithromycin Tablets 500 mg"]]
            for b, d in picks:
                s.add(WatchItem(user_id=demo.id, batch_no=b, batch_norm=re.sub(r"[^A-Z0-9]", "", b.upper()),
                                drug_name=d))
        s.commit()


def setup(hold_back: str | None):
    init_db()
    hb = date.fromisoformat(hold_back + "-01") if hold_back else None
    print("Loading data...", fetch.load_seed(hb))
    seed_users()
    run_id = start_run("setup")
    for st in ["clean", "score", "index"]:
        print(st, "...", flush=True)
        r = run_step(run_id, st)
        print("  ", {k: v for k, v in r["result"].items() if k != "new_record_ids"})
    finish_run(run_id)
    print("Setup finished.")


def reset_demo():
    """Undo monthly runs so the demo can be shown again: removes rows that came from
    the portal or the incoming folder, and puts the held-back file back."""
    from sqlalchemy import text
    with SessionLocal() as s:
        s.execute(text("delete from alerts"))
        s.execute(text("delete from cleaning_log where raw_id in (select id from raw_records where origin <> 'seed')"))
        s.execute(text("delete from records where raw_id in (select id from raw_records where origin <> 'seed')"))
        s.execute(text("delete from raw_records where origin <> 'seed'"))
        s.execute(text("delete from companies c where not exists (select 1 from records r where r.company_id = c.id)"))
        s.commit()
    for f in INCOMING_DIR.glob("*.done"):
        f.rename(f.with_suffix(".csv"))
    rid = start_run("setup")
    for st in ["score", "index"]:
        run_step(rid, st)
    finish_run(rid)
    print("Demo reset. Press Run now on the Admin page (or trigger n8n) to load the held-back month again.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--hold-back", default="2026-07", help="month kept aside for the demo run (YYYY-MM), 'none' to load all")
    ap.add_argument("--monthly", action="store_true")
    ap.add_argument("--step", choices=STEPS)
    ap.add_argument("--reset-demo", action="store_true")
    ap.add_argument("--reset-pharmacy", action="store_true", help="rebuild the demo pharmacy account")
    a = ap.parse_args()
    if a.setup:
        setup(None if a.hold_back == "none" else a.hold_back)
    elif a.reset_demo:
        reset_demo()
    elif a.reset_pharmacy:
        init_db()
        from .demo import reset_demo_pharmacy
        reset_demo_pharmacy(hash_pw)
        alerts.run(None, None)
        print("Demo pharmacy rebuilt: pharmacy@pharmaaudit.in / Pharmacy@123")
    elif a.monthly:
        rid = run_all("schedule")
        with SessionLocal() as s:
            print(json.dumps(s.get(PipelineRun, rid).steps, indent=1, default=str)[:3000])
    elif a.step:
        init_db()
        rid = start_run("manual")
        print(run_step(rid, a.step))
        finish_run(rid)
    else:
        ap.print_help()
