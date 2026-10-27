"""Step 1 - get raw records.

Sources, in order:
  1. CDSCO public NSQ portal (JSON, one request per month)
  2. CSV files dropped into data/incoming/ (backup if the portal is down)
Rows are stored untouched in raw_records. A hash of each row stops duplicates,
so running this twice is safe.
"""
import hashlib, json, time
from datetime import date
import pandas as pd
import requests
from sqlalchemy import select, func
from .db import SessionLocal, RawRecord
from .config import INCOMING_DIR, SEED_CSV

BASE = "https://cdscoonline.gov.in/CDSCO"
PORTAL = f"{BASE}/viewPublicNSQDrug"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
HEAD = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": PORTAL,
    "Accept": "application/json, text/javascript, */*; q=0.01",
}
PORTAL_FIELDS = {
    "str_product_name": "drug_name",
    "str_batch_no": "batch_no",
    "dt_manufacturing_date": "mfg_date",
    "dt_expiry_date": "expiry_date",
    "str_manufactured_by": "manufacturer_raw",
    "str_nsq_result": "failure_reason",
    "str_reporting_source": "reporting_source",
    "str_reported_by_lab_or_state": "testing_lab",
    "dt_reporting_month_year": "reporting_month",
}
RAW_FIELDS = ["drug_name", "batch_no", "mfg_date", "expiry_date", "manufacturer_raw",
              "failure_reason", "reporting_source", "testing_lab", "reporting_month"]


def month_label(d: date) -> str:
    return f"{MONTHS[d.month - 1]}-{d.year}"


def parse_label(s: str) -> date:
    m, y = s.split("-")
    return date(int(y), MONTHS.index(m.upper()) + 1, 1)


def _hash(row: dict) -> str:
    key = "|".join(str(row.get(f) or "").strip() for f in RAW_FIELDS)
    return hashlib.sha256(key.encode()).hexdigest()


def store_rows(rows: list[dict], origin: str, run_id=None) -> int:
    """Insert rows that are not already stored. Returns number of new rows."""
    if not rows:
        return 0
    with SessionLocal() as s:
        existing = set(s.scalars(select(RawRecord.row_hash)).all())
        new = 0
        for r in rows:
            clean = {f: (None if pd.isna(r.get(f)) else str(r.get(f)).strip()) for f in RAW_FIELDS}
            h = _hash(clean)
            if h in existing:
                continue
            existing.add(h)
            s.add(RawRecord(row_hash=h, source_month=r.get("source_month") or clean["reporting_month"],
                            origin=origin, run_id=run_id, **clean))
            new += 1
        s.commit()
    return new


def load_seed(hold_back_from: date | None = None) -> dict:
    """First-time load from the CSV collected in Phase 1.
    Months from hold_back_from onward are written to data/incoming/ instead,
    so the monthly run has something new to pick up during the demo."""
    df = pd.read_csv(SEED_CSV, dtype=str)
    df["_m"] = df["source_month"].apply(parse_label)
    held = 0
    if hold_back_from:
        later = df[df["_m"] >= hold_back_from]
        df = df[df["_m"] < hold_back_from]
        INCOMING_DIR.mkdir(parents=True, exist_ok=True)
        for m, part in later.groupby("_m"):
            part[RAW_FIELDS + ["source_month"]].to_csv(INCOMING_DIR / f"cdsco_{m:%Y-%m}.csv", index=False)
            held += len(part)
    n = store_rows(df.to_dict("records"), origin="seed")
    return {"loaded": n, "held_back_for_demo": held}


# ------------------------------------------------------------------ portal
def _session():
    s = requests.Session()
    s.headers.update(HEAD)
    s.get(PORTAL, timeout=25).raise_for_status()
    return s


def fetch_month(s, d: date) -> list[dict]:
    r = s.get(f"{BASE}/filteredNsqDrugTable",
              params={"month": month_label(d), "source": "All", "tab": "nsq"}, timeout=25)
    if r.status_code != 200:
        return []
    rows = json.loads(r.text).get("aaData", [])
    out = []
    for b in rows:
        row = {new: b.get(old) for old, new in PORTAL_FIELDS.items()}
        row["source_month"] = month_label(d)
        out.append(row)
    return out


def months_to_check() -> list[date]:
    """From the latest month we have (re-checked, CDSCO adds late rows) to this month."""
    with SessionLocal() as s:
        labels = s.scalars(select(RawRecord.source_month).distinct()).all()
    today = date.today().replace(day=1)
    if labels:
        start = max(parse_label(x) for x in labels if x)
    else:
        start = date(2019, 1, 1)
    out, d = [], start
    while d <= today:
        out.append(d)
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out


def run(run_id=None) -> dict:
    report = {"portal": "not tried", "months_checked": [], "new_from_portal": 0,
              "files_imported": [], "new_from_files": 0}
    months = months_to_check()
    report["months_checked"] = [month_label(m) for m in months]
    try:
        s = _session()
        got = []
        for m in months:
            got += fetch_month(s, m)
            time.sleep(0.2)
        report["new_from_portal"] = store_rows(got, origin="portal", run_id=run_id)
        report["portal"] = f"ok, {len(got)} rows read"
    except Exception as e:
        report["portal"] = f"unreachable ({type(e).__name__}), using backup files"

    # backup / manual drop folder
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    for f in sorted(INCOMING_DIR.glob("*.csv")):
        df = pd.read_csv(f, dtype=str)
        n = store_rows(df.to_dict("records"), origin="file", run_id=run_id)
        report["new_from_files"] += n
        report["files_imported"].append(f"{f.name}: {n} new")
        f.rename(f.with_suffix(".done"))
    report["new_total"] = report["new_from_portal"] + report["new_from_files"]
    return report
