"""Medi-Flaw API.   Run:  uvicorn backend.main:app --reload --port 8000
Docs at http://localhost:8000/docs
"""
import csv, io, re, threading, time
from datetime import datetime, timedelta, date
import bcrypt, httpx, jwt
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func, or_, desc, text
from pipeline.db import (SessionLocal, init_db, utcnow, RawRecord, Record, Company, CleaningLog, User, EmailCode, AuthEvent,
                         WatchItem, Alert, PipelineRun, Spike, ModelReport, AskLog)
from pipeline.config import SECRET_KEY, PIPELINE_KEY, N8N_WEBHOOK_URL, GROQ_API_KEY, GROQ_MODEL, GEMINI_API_KEY, GEMINI_MODEL, LLM_ORDER
from pipeline import run as pipeline
from pipeline import rag
from pipeline.findings import findings

app = FastAPI(title="Medi-Flaw API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    init_db()
    pipeline.seed_users()
    closed = pipeline.close_stale_runs()
    if closed:
        print(f"Marked {closed} interrupted pipeline run(s) as failed", flush=True)
    from pipeline.demo import seed_demo_pharmacy
    try:
        if seed_demo_pharmacy(pipeline.hash_pw):
            _check_now()
    except Exception as e:
        print("Demo pharmacy not created:", e)


def bnorm(b: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (b or "").upper())


def rec_json(r: Record) -> dict:
    return {"id": r.id, "drug_name": r.drug_name, "batch_no": r.batch_no, "batch_norm": r.batch_norm,
            "manufacturer": r.manufacturer, "company_id": r.company_id, "state": r.state,
            "failure_reason": r.failure_reason, "findings": findings(r.failure_reason),
            "category": r.category, "danger": r.danger,
            "danger_note": r.danger_note, "testing_lab": r.testing_lab, "reporting_source": r.reporting_source,
            "report_month": r.report_month.isoformat() if r.report_month else None,
            "mfg_date": r.mfg_date.isoformat() if r.mfg_date else None,
            "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None}


def co_json(c: Company) -> dict:
    return {"id": c.id, "name": c.name, "aliases": c.aliases or [], "state": c.state,
            "total_failures": c.total_failures, "repeat_score": c.repeat_score, "risk_score": c.risk_score,
            "risk_band": c.risk_band, "risk_reasons": c.risk_reasons or [],
            "first_month": c.first_month.isoformat() if c.first_month else None,
            "last_month": c.last_month.isoformat() if c.last_month else None}


# ------------------------------------------------------------------ auth
class Login(BaseModel):
    email: EmailStr
    password: str


class Register(Login):
    name: str
    organisation: str | None = None
    account_type: str = "business"


class GoogleIn(BaseModel):
    credential: str
    account_type: str = "business"
    organisation: str | None = None


def _acct(t: str | None) -> str:
    return "personal" if (t or "").lower() == "personal" else "business"


_google_keys = None


def verify_google(credential: str) -> dict:
    """Check a Google sign-in token: signed by Google, made for our app, not expired, email verified."""
    global _google_keys
    from pipeline.config import GOOGLE_CLIENT_ID
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not set up")
    if _google_keys is None:
        _google_keys = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)
    try:
        key = _google_keys.get_signing_key_from_jwt(credential).key
        data = jwt.decode(credential, key, algorithms=["RS256"], audience=GOOGLE_CLIENT_ID,
                          issuer=["accounts.google.com", "https://accounts.google.com"])
    except Exception:
        raise HTTPException(401, "Google sign-in failed. Please try again.")
    if not data.get("email") or not data.get("email_verified"):
        raise HTTPException(401, "Your Google email is not verified")
    return data


def make_token(u: User) -> str:
    return jwt.encode({"sub": str(u.id), "role": u.role, "exp": utcnow() + timedelta(hours=12)},
                      SECRET_KEY, algorithm="HS256")


def current_user(authorization: str = Header(default="")) -> User:
    try:
        data = jwt.decode(authorization.replace("Bearer ", ""), SECRET_KEY, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Please log in")
    with SessionLocal() as s:
        u = s.get(User, int(data["sub"]))
    if not u:
        raise HTTPException(401, "Please log in")
    return u


def admin_user(u: User = Depends(current_user)) -> User:
    if u.role != "admin":
        raise HTTPException(403, "Admins only")
    return u


def user_json(u: User):
    return {"id": u.id, "email": u.email, "name": u.name, "organisation": u.organisation, "role": u.role,
            "account_type": u.account_type or "business", "avatar": u.avatar,
            "auth_provider": u.auth_provider or "password"}


def password_problem(p: str) -> str | None:
    """Same rules as the meter on the website: 8+ characters with a letter, a number and a symbol."""
    if len(p or "") < 8:
        return "Use a password with at least 8 characters"
    if not re.search(r"[A-Za-z]", p):
        return "Add at least one letter to your password"
    if not re.search(r"\d", p):
        return "Add at least one number to your password"
    if not re.search(r"[^A-Za-z0-9]", p):
        return "Add at least one symbol (like @ # ! $) to your password"
    return None


def log_event(user_id: int | None, kind: str, method: str | None = None):
    """Best effort: activity logging must never block a login."""
    try:
        with SessionLocal() as s:
            s.add(AuthEvent(user_id=user_id, kind=kind, method=method))
            s.commit()
    except Exception as e:
        print(f"auth event not saved: {e}", flush=True)


def _code_hash(email: str, code: str) -> str:
    import hashlib, hmac
    return hmac.new(SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


@app.post("/api/auth/register")
def register(body: Register):
    """Step 1 of sign-up: check the details and email a 6-digit code. No account is made yet."""
    import secrets
    from pipeline.alerts import send_email
    email = body.email.lower().strip()
    if password_problem(body.password):
        raise HTTPException(400, password_problem(body.password))
    if not body.name.strip():
        raise HTTPException(400, "Please enter your name")
    now = utcnow()
    with SessionLocal() as s:
        if s.scalar(select(User).where(User.email == email)):
            raise HTTPException(400, "This email is already registered. Log in instead.")
        recent = s.scalars(select(EmailCode).where(EmailCode.email == email,
                                                  EmailCode.created_at > now - timedelta(hours=1))).all()
        if any(c.created_at > now - timedelta(seconds=45) for c in recent):
            raise HTTPException(429, "A code was just sent. Please wait a moment before asking again.")
        if len(recent) >= 5:
            raise HTTPException(429, "Too many codes for this email. Try again in an hour.")
        code = f"{secrets.randbelow(1000000):06d}"
        acct = _acct(body.account_type)
        s.add(EmailCode(email=email, code_hash=_code_hash(email, code), expires_at=now + timedelta(minutes=10),
                        payload={"name": body.name.strip()[:200], "account_type": acct,
                                 "organisation": (body.organisation or "").strip()[:200] or None if acct == "business" else None,
                                 "password_hash": pipeline.hash_pw(body.password)}))
        s.commit()
    status = send_email(email, f"{code} is your Medi-Flaw code",
                        f"""Hello {body.name.strip()},

Your Medi-Flaw sign-up code is:

    {code}

It works for 10 minutes. If you did not ask for this, you can ignore this email.

Medi-Flaw""")
    if status != "sent":
        raise HTTPException(503, "We could not send the code right now. Please try again, or continue with Google.")
    return {"verify": True, "email": email}


class VerifyIn(BaseModel):
    email: EmailStr
    code: str


@app.post("/api/auth/verify")
def verify_code(body: VerifyIn):
    """Step 2 of sign-up: the right code creates the account and logs in."""
    email = body.email.lower().strip()
    code = re.sub(r"\D", "", body.code or "")
    with SessionLocal() as s:
        c = s.scalar(select(EmailCode).where(EmailCode.email == email, EmailCode.used == False)  # noqa: E712
                     .order_by(desc(EmailCode.id)).limit(1))
        if not c or c.expires_at < utcnow():
            raise HTTPException(400, "This code has expired. Ask for a new one.")
        if c.attempts >= 5:
            raise HTTPException(429, "Too many wrong tries. Ask for a new code.")
        if len(code) != 6 or _code_hash(email, code) != c.code_hash:
            c.attempts += 1
            s.commit()
            left = 5 - c.attempts
            raise HTTPException(400, f"Wrong code. {left} {'try' if left == 1 else 'tries'} left." if left else "Too many wrong tries. Ask for a new code.")
        if s.scalar(select(User).where(User.email == email)):
            c.used = True
            s.commit()
            raise HTTPException(400, "This email is already registered. Log in instead.")
        p = c.payload or {}
        u = User(email=email, name=p.get("name") or email.split("@")[0], organisation=p.get("organisation"),
                 account_type=p.get("account_type") or "business", auth_provider="password",
                 role="pharmacist", password_hash=p["password_hash"])
        c.used = True
        s.add(u)
        s.commit()
    log_event(u.id, "signup", "password")
    return {"token": make_token(u), "user": user_json(u)}


@app.post("/api/auth/login")
def login(body: Login):
    with SessionLocal() as s:
        u = s.scalar(select(User).where(User.email == body.email.lower()))
    if not u or not bcrypt.checkpw(body.password.encode(), u.password_hash.encode()):
        if u:
            log_event(u.id, "login_failed", "password")
        raise HTTPException(401, "Wrong email or password")
    log_event(u.id, "login", "password")
    return {"token": make_token(u), "user": user_json(u)}


@app.post("/api/auth/google")
def google_login(body: GoogleIn):
    g = verify_google(body.credential)
    email = g["email"].lower()
    new = False
    with SessionLocal() as s:
        u = s.scalar(select(User).where(User.email == email))
        if not u:
            import secrets
            new = True
            acct = _acct(body.account_type)
            u = User(email=email, name=(g.get("name") or email.split("@")[0])[:200],
                     organisation=(body.organisation or None) if acct == "business" else None,
                     account_type=acct, auth_provider="google", role="pharmacist",
                     password_hash=pipeline.hash_pw(secrets.token_urlsafe(32)))
            s.add(u)
            s.commit()
    log_event(u.id, "signup" if new else "login", "google")
    return {"token": make_token(u), "user": user_json(u)}


@app.post("/api/auth/logout")
def logout_event(u: User = Depends(current_user)):
    log_event(u.id, "logout")
    return {"ok": True}


@app.get("/api/auth/config")
def auth_config():
    from pipeline.config import GOOGLE_CLIENT_ID
    return {"google_client_id": GOOGLE_CLIENT_ID or None}


class PasswordIn(BaseModel):
    current: str
    new: str


@app.post("/api/auth/password")
def change_password(body: PasswordIn, u: User = Depends(current_user)):
    if password_problem(body.new):
        raise HTTPException(400, password_problem(body.new))
    with SessionLocal() as s:
        x = s.get(User, u.id)
        if (x.auth_provider or "password") == "google":
            raise HTTPException(400, "You sign in with Google, so there is no password to change")
        if not bcrypt.checkpw(body.current.encode(), x.password_hash.encode()):
            raise HTTPException(400, "Your current password is wrong")
        x.password_hash = pipeline.hash_pw(body.new)
        s.commit()
    log_event(u.id, "password_changed", "password")
    return {"ok": True}


@app.get("/api/auth/me")
def me(u: User = Depends(current_user)):
    return user_json(u)


# ------------------------------------------------------------------ public data
@app.get("/api/health")
def health():
    """For uptime pings. Answers without touching the database, so the database can still sleep."""
    return {"ok": True}


@app.get("/api/stats")
def stats():
    with SessionLocal() as s:
        total = s.scalar(select(func.count(Record.id)))
        companies = s.scalar(select(func.count(Company.id)).where(Company.total_failures > 0))
        first, last = s.execute(select(func.min(Record.report_month), func.max(Record.report_month))).one()
        repeat = s.scalar(select(func.count(Company.id)).where(Company.total_failures > 1))
        from_repeat = s.scalar(select(func.sum(Company.total_failures)).where(Company.total_failures > 1)) or 0
        latest = s.scalars(select(Record).where(Record.report_month == last)
                           .order_by(Record.danger == "LOW", Record.danger == "MEDIUM", Record.id).limit(8)).all()
        last_run = s.scalar(select(PipelineRun).where(PipelineRun.status == "done").order_by(desc(PipelineRun.id)))
        high = s.scalar(select(func.count(Record.id)).where(Record.danger == "HIGH"))
    return {"records": total, "companies": companies, "repeat_companies": repeat,
            "repeat_share": round(from_repeat / total, 3) if total else 0, "high": high,
            "first_month": first.isoformat() if first else None, "last_month": last.isoformat() if last else None,
            "last_update": last_run.finished_at.isoformat() if last_run and last_run.finished_at else None,
            "latest": [rec_json(r) for r in latest]}


@app.get("/api/search")
def search(q: str = Query(min_length=2), limit: int = 50):
    term = q.strip()
    with SessionLocal() as s:
        recs = s.scalars(select(Record).where(or_(Record.batch_norm == bnorm(term),
                                                  Record.batch_norm.like(f"%{bnorm(term)}%") if len(bnorm(term)) >= 4 else False,
                                                  Record.drug_name.ilike(f"%{term}%"),
                                                  Record.manufacturer.ilike(f"%{term}%")))
                         .order_by(desc(Record.report_month)).limit(limit)).all()
        cos = s.scalars(select(Company).where(Company.total_failures > 0, Company.name.ilike(f"%{term}%"))
                        .order_by(desc(Company.total_failures)).limit(10)).all()
    return {"query": term, "records": [rec_json(r) for r in recs], "companies": [co_json(c) for c in cos]}


@app.get("/api/batch/{batch}")
def batch(batch: str):
    with SessionLocal() as s:
        recs = s.scalars(select(Record).where(Record.batch_norm == bnorm(batch))
                         .order_by(desc(Record.report_month))).all()
        out = []
        for r in recs:
            c = s.get(Company, r.company_id) if r.company_id else None
            out.append({**rec_json(r), "company": co_json(c) if c else None})
        last = s.scalar(select(func.max(Record.report_month)))
    return {"batch": batch, "failed": bool(out), "records": out,
            "checked_until": last.isoformat() if last else None}


@app.get("/api/records/{rid}")
def record(rid: int):
    with SessionLocal() as s:
        r = s.get(Record, rid)
        if not r:
            raise HTTPException(404, "Not found")
        raw = s.get(RawRecord, r.raw_id)
        c = s.get(Company, r.company_id) if r.company_id else None
        return {**rec_json(r), "company": co_json(c) if c else None,
                "raw": {"manufacturer": raw.manufacturer_raw, "failure_reason": raw.failure_reason,
                        "source_month": raw.source_month, "origin": raw.origin}}


PERIODS = {"all": None, "1m": 1, "3m": 3, "6m": 6, "year": "year", "1y": 12, "2y": 24, "3y": 36}


def period_start(s, period: str):
    """Start month for a period, counted back from the latest CDSCO list we have."""
    last = s.scalar(select(func.max(Record.report_month)))
    p = PERIODS.get(period)
    if not last or p is None:
        return None, last
    if p == "year":
        return date(last.year, 1, 1), last
    m = last.year * 12 + last.month - 1 - (p - 1)
    return date(m // 12, m % 12 + 1, 1), last


@app.get("/api/companies")
def companies(sort: str = "risk", q: str = "", state: str = "", period: str = "all", page: int = 1, size: int = 50):
    with SessionLocal() as s:
        start, last = period_start(s, period)
        cnt = (select(Record.company_id.label("cid"), func.count(Record.id).label("n"),
                      func.max(Record.report_month).label("last_m"))
               .where(Record.report_month >= start) if start else
               select(Record.company_id.label("cid"), func.count(Record.id).label("n"),
                      func.max(Record.report_month).label("last_m"))).group_by(Record.company_id).subquery()
        order = {"risk": desc(Company.risk_score), "failures": desc(cnt.c.n), "repeat": desc(Company.repeat_score),
                 "recent": desc(cnt.c.last_m), "name": Company.name}.get(sort, desc(Company.risk_score))
        base = select(Company, cnt.c.n).join(cnt, cnt.c.cid == Company.id)
        if q:
            base = base.where(Company.name.ilike(f"%{q}%"))
        if state:
            base = base.where(Company.state == state)
        total = s.scalar(select(func.count()).select_from(base.subquery()))
        rows = s.execute(base.order_by(order, desc(cnt.c.n), Company.name).offset((page - 1) * size).limit(size)).all()
        states = [x for x in s.scalars(select(Company.state).where(Company.state.isnot(None)).distinct()).all()]
    return {"total": total, "page": page, "states": sorted(states),
            "period": {"key": period, "from": start.isoformat() if start else None,
                       "to": last.isoformat() if last else None},
            "items": [{**co_json(c), "period_failures": n} for c, n in rows]}


@app.get("/api/companies/{cid}")
def company(cid: int):
    with SessionLocal() as s:
        c = s.get(Company, cid)
        if not c:
            raise HTTPException(404, "Not found")
        recs = s.scalars(select(Record).where(Record.company_id == cid).order_by(desc(Record.report_month))).all()
        spikes = s.scalars(select(Spike).where(Spike.company_id == cid).order_by(Spike.month)).all()
    by_year, by_cat = {}, {}
    for r in recs:
        by_year[r.report_month.year] = by_year.get(r.report_month.year, 0) + 1
        by_cat[r.category] = by_cat.get(r.category, 0) + 1
    return {**co_json(c), "records": [rec_json(r) for r in recs],
            "by_year": [{"year": y, "count": n} for y, n in sorted(by_year.items())],
            "by_category": sorted([{"category": k, "count": v} for k, v in by_cat.items()], key=lambda x: -x["count"]),
            "spikes": [{"month": x.month.isoformat(), "failures": x.failures, "usual": x.usual} for x in spikes]}


@app.get("/api/insights")
def insights():
    with SessionLocal() as s:
        q = lambda sql: [dict(r._mapping) for r in s.execute(text(sql)).all()]
        per_month = q("select to_char(report_month,'YYYY-MM') as month, count(*) as count from records group by 1 order by 1")
        per_year = q("select extract(year from report_month)::int as year, count(*) as count, "
                     "sum((danger='HIGH')::int) as high from records group by 1 order by 1")
        per_cat = q("select category, count(*) as count from records group by 1 order by 2 desc")
        per_state = q("select coalesce(state,'Not known') as state, count(*) as count from records group by 1 order by 2 desc limit 15")
        per_danger = q("select danger, count(*) as count from records group by 1")
        top = q("select id, name, state, total_failures, risk_score, risk_band from companies "
                "where total_failures>0 order by total_failures desc limit 10")
        spikes = q("select s.month, s.failures, s.usual, c.id as company_id, c.name from spikes s "
                   "join companies c on c.id=s.company_id order by s.month desc limit 15")
        repeat = q("select count(*) filter (where total_failures>1) as repeat_cos, count(*) as cos, "
                   "sum(total_failures) filter (where total_failures>1) as from_repeat, sum(total_failures) as total "
                   "from companies where total_failures>0")[0]
    for x in spikes:
        x["month"] = x["month"].isoformat()
    return {"per_month": per_month, "per_year": per_year, "per_category": per_cat, "per_state": per_state,
            "per_danger": per_danger, "top_companies": top, "spikes": spikes, "repeat": repeat}


# ------------------------------------------------------------------ before / after cleaning
@app.get("/api/data/summary")
def data_summary():
    with SessionLocal() as s:
        q = lambda sql: s.execute(text(sql)).scalar()
        rows = lambda sql: [dict(r._mapping) for r in s.execute(text(sql)).all()]
        return {
            "raw_rows": q("select count(*) from raw_records"),
            "clean_rows": q("select count(*) from records"),
            "duplicates": q("select count(*) from cleaning_log where field='row'"),
            "raw_company_spellings": q("select count(distinct manufacturer_raw) from raw_records"),
            "companies": q("select count(*) from companies where total_failures>0"),
            "raw_reasons": q("select count(distinct failure_reason) from raw_records"),
            "categories": q("select count(distinct category) from records"),
            "raw_labs": q("select count(distinct testing_lab) from raw_records"),
            "labs": q("select count(distinct testing_lab) from records"),
            "raw_sources": rows("select reporting_source as value, count(*) as count from raw_records group by 1 order by 2 desc"),
            "sources": rows("select reporting_source as value, count(*) as count from records group by 1 order by 2 desc"),
            "changes_by_rule": rows("select field, rule, count(*) as count from cleaning_log "
                                    "where rule not like 'Merged%' and rule not like 'Same company%' group by 1,2 "
                                    "union all select 'manufacturer', 'Merged or matched spelling variants', count(*) "
                                    "from cleaning_log where rule like 'Merged%' or rule like 'Same company%' order by 3 desc"),
            "no_state": q("select count(*) from records where state is null"),
        }


@app.get("/api/data/raw")
def data_raw(page: int = 1, size: int = 25, q: str = ""):
    with SessionLocal() as s:
        base = select(RawRecord)
        if q:
            base = base.where(or_(RawRecord.manufacturer_raw.ilike(f"%{q}%"), RawRecord.drug_name.ilike(f"%{q}%"),
                                  RawRecord.batch_no.ilike(f"%{q}%")))
        total = s.scalar(select(func.count()).select_from(base.subquery()))
        rows = s.scalars(base.order_by(RawRecord.id).offset((page - 1) * size).limit(size)).all()
    cols = ["id", "source_month", "drug_name", "batch_no", "mfg_date", "expiry_date", "manufacturer_raw",
            "failure_reason", "reporting_source", "testing_lab", "origin"]
    return {"total": total, "columns": cols, "rows": [{c: getattr(r, c) for c in cols} for r in rows]}


@app.get("/api/data/clean")
def data_clean(page: int = 1, size: int = 25, q: str = ""):
    with SessionLocal() as s:
        base = select(Record)
        if q:
            base = base.where(or_(Record.manufacturer.ilike(f"%{q}%"), Record.drug_name.ilike(f"%{q}%"),
                                  Record.batch_norm.like(f"%{bnorm(q)}%")))
        total = s.scalar(select(func.count()).select_from(base.subquery()))
        rows = s.scalars(base.order_by(Record.raw_id).offset((page - 1) * size).limit(size)).all()
    return {"total": total, "rows": [{**rec_json(r), "raw_id": r.raw_id} for r in rows]}


@app.get("/api/data/changes")
def data_changes(page: int = 1, size: int = 25, field: str = "", raw_id: int | None = None):
    with SessionLocal() as s:
        base = select(CleaningLog)
        if field:
            base = base.where(CleaningLog.field == field)
        if raw_id:
            base = base.where(CleaningLog.raw_id == raw_id)
        total = s.scalar(select(func.count()).select_from(base.subquery()))
        rows = s.scalars(base.order_by(CleaningLog.raw_id, CleaningLog.id).offset((page - 1) * size).limit(size)).all()
    return {"total": total, "rows": [{"raw_id": r.raw_id, "field": r.field, "before": r.before, "after": r.after,
                                      "rule": r.rule} for r in rows]}


# ------------------------------------------------------------------ return letter + acknowledge
@app.get("/api/letter/{rid}")
def letter(rid: int):
    with SessionLocal() as s:
        r = s.get(Record, rid)
        if not r:
            raise HTTPException(404, "Not found")
    return {"record": rec_json(r), "text": f"""To,
The Distributor / Stockist
______________________________

Date: {date.today():%d %B %Y}

Subject: Return of batch {r.batch_no} declared Not of Standard Quality by CDSCO

Dear Sir/Madam,

The following batch supplied to us appears in the CDSCO list of drugs declared
Not of Standard Quality for {r.report_month:%B %Y}:

  Medicine       : {r.drug_name}
  Batch number   : {r.batch_no}
  Manufacturer   : {r.manufacturer}
  Test failed    : {r.failure_reason}
  Tested by      : {r.testing_lab or '-'}
  Mfg / Expiry   : {r.mfg_date.strftime('%b %Y') if r.mfg_date else '-'} / {r.expiry_date.strftime('%b %Y') if r.expiry_date else '-'}

We have stopped sale of this batch. Please arrange to collect the remaining stock
and issue credit for the quantity returned. Quantity held: ________

The CDSCO monthly list is published at https://cdsco.gov.in (Drugs Alert section).

Thank you,

______________________________
Name / Shop / Drug licence no.
"""}


@app.get("/api/ack/{token}")
def acknowledge(token: str):
    with SessionLocal() as s:
        a = s.scalar(select(Alert).where(Alert.token == token))
        if not a:
            raise HTTPException(404, "Link not valid")
        if not a.acknowledged_at:
            a.acknowledged_at = utcnow()
            s.commit()
        r = s.get(Record, a.record_id)
    return {"ok": True, "batch_no": r.batch_no, "drug_name": r.drug_name}


# ------------------------------------------------------------------ my medicines (watchlist)
class WatchIn(BaseModel):
    batch_no: str
    drug_name: str | None = None
    manufacturer: str | None = None
    quantity: int | None = None
    purchased_on: date | None = None
    supplier: str | None = None
    note: str | None = None
    taken_by: str | None = None


class BulkIn(BaseModel):
    items: list[WatchIn]
    source: str = "manual"


class WatchPatch(BaseModel):
    status: str


def _company_index(s):
    from pipeline.clean import name_key
    rows = s.execute(select(Company.id, Company.name, Company.name_key, Company.risk_score, Company.risk_band,
                            Company.total_failures).where(Company.total_failures > 0)).all()
    return {r.name_key: r for r in rows}, name_key


def watch_rows(s, uid):
    items = s.scalars(select(WatchItem).where(WatchItem.user_id == uid)
                      .order_by(desc(WatchItem.purchased_on), desc(WatchItem.id))).all()
    norms = [w.batch_norm for w in items]
    hits = {}
    if norms:
        for r in s.scalars(select(Record).where(Record.batch_norm.in_(norms)).order_by(Record.report_month)).all():
            hits[r.batch_norm] = r
    alerts_by_watch = {}
    for a in s.scalars(select(Alert).where(Alert.user_id == uid).order_by(Alert.id)).all():
        alerts_by_watch[a.watch_id] = a
    cindex, nk = _company_index(s)
    out = []
    from pipeline.matching import same_batch
    for w in items:
        hit = hits.get(w.batch_norm)
        match_note, mismatch = None, None
        if hit:
            ok, how = same_batch(w.manufacturer, w.drug_name, hit)
            if ok:
                match_note = how
                if hit.expiry_date and w.purchased_on and w.purchased_on > hit.expiry_date:
                    match_note += f"; this batch had already expired in {hit.expiry_date:%b %Y}"
            else:
                mismatch, hit = how, None
        co = None
        if hit and hit.company_id:
            c = s.get(Company, hit.company_id)
            co = {"id": c.id, "name": c.name, "risk_score": c.risk_score, "risk_band": c.risk_band, "failures": c.total_failures}
        elif w.manufacturer:
            r = cindex.get(nk(w.manufacturer))
            if r:
                co = {"id": r.id, "name": r.name, "risk_score": r.risk_score, "risk_band": r.risk_band, "failures": r.total_failures}
        a = alerts_by_watch.get(w.id)
        out.append({"id": w.id, "batch_no": w.batch_no, "batch_norm": w.batch_norm, "drug_name": w.drug_name,
                    "manufacturer": w.manufacturer, "quantity": w.quantity,
                    "purchased_on": w.purchased_on.isoformat() if w.purchased_on else None,
                    "supplier": w.supplier, "source": w.source, "status": w.status, "note": w.note,
                    "taken_by": w.taken_by,
                    "added": w.created_at.isoformat(), "failed": bool(hit),
                    "match_note": match_note, "mismatch": mismatch,
                    "record": rec_json(hit) if hit else None, "company": co,
                    "alert": {"sent_at": a.sent_at.isoformat(), "delivery": a.delivery,
                              "acknowledged": bool(a.acknowledged_at)} if a else None})
    return out


def _add_items(s, uid, items: list[WatchIn], source: str) -> int:
    have = set(s.scalars(select(WatchItem.batch_norm).where(WatchItem.user_id == uid)).all())
    added = 0
    for it in items:
        n = bnorm(it.batch_no)
        if len(n) < 3 or n in have:
            continue
        have.add(n)
        s.add(WatchItem(user_id=uid, batch_no=it.batch_no.strip(), batch_norm=n, drug_name=(it.drug_name or None),
                        manufacturer=it.manufacturer or None, quantity=it.quantity or None,
                        purchased_on=it.purchased_on or date.today(), supplier=it.supplier or None,
                        note=it.note, source=source, taken_by=(it.taken_by or "").strip()[:80] or None))
        added += 1
    s.commit()
    return added


_alert_lock = threading.Lock()


def _check_now():
    """Batches that are already in a failed list get an alert straight away.
    Runs in the background so the user's request returns at once, and one check
    at a time so two quick clicks can never send the same alert twice."""
    from pipeline import alerts

    def work():
        with _alert_lock:
            try:
                alerts.run(None, None)
            except Exception as e:
                print(f"Alert check failed: {type(e).__name__}: {e}", flush=True)

    threading.Thread(target=work, daemon=True).start()


@app.get("/api/watchlist")
def watchlist(u: User = Depends(current_user)):
    with SessionLocal() as s:
        return {"items": watch_rows(s, u.id)}


@app.post("/api/watchlist")
def watch_add(body: WatchIn, u: User = Depends(current_user)):
    if len(bnorm(body.batch_no)) < 3:
        raise HTTPException(400, "Enter a valid batch number")
    with SessionLocal() as s:
        if s.scalar(select(WatchItem).where(WatchItem.user_id == u.id, WatchItem.batch_norm == bnorm(body.batch_no))):
            raise HTTPException(400, "Already on your list")
        _add_items(s, u.id, [body], "manual")
    _check_now()
    with SessionLocal() as s:
        return {"items": watch_rows(s, u.id)}


@app.post("/api/watchlist/bulk")
def watch_bulk(body: BulkIn, u: User = Depends(current_user)):
    with SessionLocal() as s:
        n = _add_items(s, u.id, body.items, body.source[:20])
    _check_now()
    with SessionLocal() as s:
        return {"added": n, "items": watch_rows(s, u.id)}


@app.post("/api/watchlist/parse")
async def watch_parse(file: UploadFile | None = File(None), text: str = Form(""), u: User = Depends(current_user)):
    """Read an invoice (PDF, CSV or text from a photo) and return the rows found, for the user to check."""
    from pipeline.invoice import pdf_text, parse_items
    raw = text
    if file is not None:
        data = await file.read()
        name = (file.filename or "").lower()
        if name.endswith(".pdf"):
            raw = pdf_text(data)
            if len(raw.strip()) < 20:
                raise HTTPException(400, "This PDF has no readable text (it is probably a scan). Use the photo option instead.")
        else:
            raw = data.decode("utf-8", errors="ignore")
    items, how = parse_items(raw)
    with SessionLocal() as s:
        norms = [bnorm(i.get("batch_no", "")) for i in items]
        failed = {r.batch_norm: r for r in s.scalars(select(Record).where(Record.batch_norm.in_(norms))).all()} if norms else {}
    from pipeline.matching import same_batch
    for i in items:
        r = failed.get(bnorm(i.get("batch_no", "")))
        if r and not same_batch(i.get("manufacturer"), i.get("drug_name"), r)[0]:
            r = None
        i["failed"] = bool(r)
        i["failed_note"] = f"{r.failure_reason} ({r.report_month:%b %Y} list)" if r else None
    return {"items": items, "read_by": how, "text_preview": raw[:1500]}


@app.patch("/api/watchlist/{wid}")
def watch_patch(wid: int, body: WatchPatch, u: User = Depends(current_user)):
    if body.status not in ("in_stock", "returned"):
        raise HTTPException(400, "Unknown status")
    with SessionLocal() as s:
        w = s.get(WatchItem, wid)
        if not w or w.user_id != u.id:
            raise HTTPException(404, "Not found")
        w.status = body.status
        s.commit()
        return {"items": watch_rows(s, u.id)}


@app.post("/api/watchlist/upload")
async def watch_upload(file: UploadFile = File(...), u: User = Depends(current_user)):
    text_ = (await file.read()).decode("utf-8", errors="ignore")
    rows = []
    for row in csv.DictReader(io.StringIO(text_)):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        b = row.get("batch_no") or row.get("batch") or row.get("batch number") or ""
        q = row.get("quantity") or row.get("qty") or ""
        d = row.get("purchased_on") or row.get("date") or ""
        try:
            dd = date.fromisoformat(d) if d else None
        except ValueError:
            dd = None
        rows.append(WatchIn(batch_no=b, drug_name=row.get("drug_name") or row.get("medicine"),
                            manufacturer=row.get("manufacturer") or row.get("company"),
                            quantity=int(q) if q.isdigit() else None, purchased_on=dd,
                            supplier=row.get("supplier")))
    with SessionLocal() as s:
        n = _add_items(s, u.id, rows, "csv")
    _check_now()
    with SessionLocal() as s:
        return {"added": n, "items": watch_rows(s, u.id)}


@app.delete("/api/watchlist/{wid}")
def watch_delete(wid: int, u: User = Depends(current_user)):
    with SessionLocal() as s:
        w = s.get(WatchItem, wid)
        if not w or w.user_id != u.id:
            raise HTTPException(404, "Not found")
        s.execute(text("delete from alerts where watch_id = :w"), {"w": wid})
        s.delete(w)
        s.commit()
        return {"items": watch_rows(s, u.id)}


# ------------------------------------------------------------------ user settings
class SettingsIn(BaseModel):
    email_alerts: bool | None = None
    extra_emails: list[str] | None = None
    avatar: str | None = None


AVATARS = {f"a{i}" for i in range(1, 11)}


@app.get("/api/me/settings")
def my_settings(u: User = Depends(current_user)):
    from pipeline.config import SMTP_USER, SMTP_PASSWORD, BREVO_API_KEY, MAIL_FROM
    return {"email_alerts": u.email_alerts is not False,
            "email_ready": bool((BREVO_API_KEY and MAIL_FROM) or (SMTP_USER and SMTP_PASSWORD)),
            "email": u.email, "name": u.name, "organisation": u.organisation,
            "account_type": u.account_type or "business", "extra_emails": u.extra_emails or [],
            "avatar": u.avatar}


@app.patch("/api/me/settings")
def set_settings(body: SettingsIn, u: User = Depends(current_user)):
    with SessionLocal() as s:
        x = s.get(User, u.id)
        if body.email_alerts is not None:
            x.email_alerts = body.email_alerts
        if body.avatar is not None:
            if body.avatar not in AVATARS:
                raise HTTPException(400, "Unknown avatar")
            x.avatar = body.avatar
        if body.extra_emails is not None:
            from email_validator import validate_email, EmailNotValidError
            clean = []
            for e in body.extra_emails:
                e = (e or "").strip().lower()
                if not e or e == x.email.lower() or e in clean:
                    continue
                try:
                    validate_email(e, check_deliverability=False)
                except EmailNotValidError:
                    raise HTTPException(400, f"Not a valid email: {e}")
                clean.append(e)
            if len(clean) > 3:
                raise HTTPException(400, "You can add up to 3 staff emails")
            if clean and (x.account_type or "business") != "business":
                raise HTTPException(400, "Staff emails are for Pharmacy & Business accounts")
            x.extra_emails = clean
        s.commit()
    return my_settings(x)


@app.get("/api/alerts")
def my_alerts(u: User = Depends(current_user)):
    with SessionLocal() as s:
        q = select(Alert).order_by(desc(Alert.id)).limit(100)
        if u.role != "admin":
            q = q.where(Alert.user_id == u.id)
        rows = s.scalars(q).all()
    return {"items": [{"id": a.id, "to": a.to_email, "subject": a.subject, "body": a.body, "delivery": a.delivery,
                       "sent_at": a.sent_at.isoformat(), "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
                       "followup_at": a.followup_at.isoformat() if a.followup_at else None, "record_id": a.record_id}
                      for a in rows]}


# ------------------------------------------------------------------ admin: users
def _iso(d):
    return d.isoformat() if d else None


@app.get("/api/admin/users")
def admin_users(a: User = Depends(admin_user)):
    from pipeline.config import FOLLOWUP_DAYS
    with SessionLocal() as s:
        users = s.scalars(select(User).order_by(desc(User.created_at))).all()
        items = dict(s.execute(select(WatchItem.user_id, func.count()).group_by(WatchItem.user_id)).all())
        failed = dict(s.execute(select(WatchItem.user_id, func.count(func.distinct(WatchItem.id)))
                                .join(Record, Record.batch_norm == WatchItem.batch_norm)
                                .where(WatchItem.status != "returned").group_by(WatchItem.user_id)).all())
        al = {r[0]: r[1:] for r in s.execute(select(Alert.user_id, func.count(), func.max(Alert.sent_at),
                                                     func.count(Alert.acknowledged_at)).group_by(Alert.user_id)).all()}
        due = {r[0]: r[1] for r in s.execute(select(Alert.user_id, func.min(Alert.sent_at))
                                              .where(Alert.acknowledged_at.is_(None), Alert.followup_at.is_(None),
                                                     Alert.delivery == "sent").group_by(Alert.user_id)).all()}
        last = {}
        for kind in ("login", "logout"):
            last[kind] = dict(s.execute(select(AuthEvent.user_id, func.max(AuthEvent.at))
                                        .where(AuthEvent.kind == kind).group_by(AuthEvent.user_id)).all())
        out = []
        for u in users:
            n_al, last_al, acked = al.get(u.id, (0, None, 0))
            out.append({**user_json(u), "joined": _iso(u.created_at), "email_alerts": u.email_alerts is not False,
                        "extra_emails": u.extra_emails or [], "medicines": items.get(u.id, 0),
                        "failed_in_stock": failed.get(u.id, 0), "alerts": n_al, "alerts_confirmed": acked,
                        "last_alert": _iso(last_al),
                        "next_reminder": _iso(due[u.id] + timedelta(days=FOLLOWUP_DAYS)) if u.id in due else None,
                        "last_login": _iso(last["login"].get(u.id)), "last_logout": _iso(last["logout"].get(u.id))})
    return {"items": out, "followup_days": FOLLOWUP_DAYS}


@app.get("/api/admin/users/{uid}")
def admin_user_detail(uid: int, a: User = Depends(admin_user)):
    from pipeline.config import FOLLOWUP_DAYS
    with SessionLocal() as s:
        u = s.get(User, uid)
        if not u:
            raise HTTPException(404, "User not found")
        meds = watch_rows(s, uid)
        alerts = s.scalars(select(Alert).where(Alert.user_id == uid).order_by(desc(Alert.id))).all()
        events = s.scalars(select(AuthEvent).where(AuthEvent.user_id == uid).order_by(desc(AuthEvent.id)).limit(100)).all()
        return {
            "user": {**user_json(u), "joined": _iso(u.created_at), "email_alerts": u.email_alerts is not False,
                     "extra_emails": u.extra_emails or []},
            "medicines": meds,
            "alerts": [{"id": x.id, "subject": x.subject, "to": x.to_email, "delivery": x.delivery,
                        "sent_at": _iso(x.sent_at), "acknowledged_at": _iso(x.acknowledged_at),
                        "followup_at": _iso(x.followup_at),
                        "reminder_due": _iso(x.sent_at + timedelta(days=FOLLOWUP_DAYS))
                        if not x.acknowledged_at and not x.followup_at and x.delivery == "sent" else None}
                       for x in alerts],
            "events": [{"kind": e.kind, "method": e.method, "at": _iso(e.at)} for e in events],
        }


# ------------------------------------------------------------------ questions
class AskIn(BaseModel):
    question: str


@app.post("/api/ask")
def ask_q(body: AskIn):
    if len(body.question.strip()) < 3:
        raise HTTPException(400, "Type a question")
    return rag.ask(body.question)


@app.get("/api/ask/status")
def ask_status():
    from pipeline.config import DATA_DIR
    f = DATA_DIR / "search_engine.txt"
    names = {"groq": f"Groq ({GROQ_MODEL.split(',')[-1].strip()})" if GROQ_API_KEY else None,
             "gemini": f"Gemini ({GEMINI_MODEL})" if GEMINI_API_KEY else None, "ollama": "Ollama (local)"}
    order = [names[n] for n in LLM_ORDER if names.get(n)]
    return {"language_model": " then ".join(order) or "none",
            "search": f.read_text() if f.exists() else "not built"}


# ------------------------------------------------------------------ pipeline (n8n calls these)
def pipeline_auth(x_pipeline_key: str = Header(default=""), authorization: str = Header(default="")):
    if x_pipeline_key == PIPELINE_KEY:
        return "n8n"
    u = current_user(authorization)
    if u.role != "admin":
        raise HTTPException(403, "Admins only")
    return "admin"


class RunIn(BaseModel):
    run_id: int | None = None
    trigger: str | None = None
    error: str | None = None


@app.post("/api/pipeline/start")
def p_start(body: RunIn, who=Depends(pipeline_auth)):
    try:
        return {"run_id": pipeline.start_run(body.trigger or who)}
    except pipeline.RunInProgress as e:
        raise HTTPException(409, str(e))


@app.post("/api/pipeline/step/{name}")
def p_step(name: str, body: RunIn, who=Depends(pipeline_auth)):
    if not body.run_id:
        raise HTTPException(400, "run_id missing")
    try:
        res = pipeline.run_step(body.run_id, name)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))
    r = res.get("result", {})
    if isinstance(r, dict) and "new_record_ids" in r:
        r = {**r, "new_record_ids": len(r["new_record_ids"])}
    return {"run_id": body.run_id, "step": name, "status": res["status"], "result": r}


@app.post("/api/pipeline/finish")
def p_finish(body: RunIn, who=Depends(pipeline_auth)):
    pipeline.finish_run(body.run_id, "done")
    return {"ok": True}


@app.post("/api/pipeline/fail")
def p_fail(body: RunIn, who=Depends(pipeline_auth)):
    if body.run_id:
        pipeline.finish_run(body.run_id, "failed", body.error or "failed in n8n")
    return {"ok": True}


@app.post("/api/pipeline/run-now")
def run_now(bg: BackgroundTasks, who=Depends(pipeline_auth)):
    """Starts a run through n8n if it is set up, otherwise runs here.
    Accepts an admin login (the website button) or the pipeline key (a scheduler such as cron-job.org).
    Returns at once; the run continues in the background."""
    if N8N_WEBHOOK_URL:
        try:
            r = httpx.post(N8N_WEBHOOK_URL, json={"trigger": "manual"}, timeout=10)
            r.raise_for_status()
            return {"started": "n8n", "message": "Run started in n8n."}
        except Exception as e:
            pass
    trigger = "manual" if who == "admin" else "schedule"
    try:
        rid = pipeline.start_run(trigger)
    except pipeline.RunInProgress as e:
        return {"started": False, "message": f"{e}. Not starting a second one."}
    bg.add_task(pipeline.run_all, trigger, rid)
    return {"started": "server", "run_id": rid, "message": "Run started."}


@app.get("/api/pipeline/runs")
def runs(u: User = Depends(admin_user)):
    with SessionLocal() as s:
        rows = s.scalars(select(PipelineRun).order_by(desc(PipelineRun.id)).limit(30)).all()
    out = []
    for r in rows:
        steps = {}
        for k, v in (r.steps or {}).items():
            res = dict(v.get("result") or {})
            if "new_record_ids" in res:
                res["new_record_ids"] = len(res["new_record_ids"])
            steps[k] = {"status": v.get("status"), "result": res, "error": v.get("error"), "seconds": v.get("seconds")}
        out.append({"id": r.id, "trigger": r.trigger, "status": r.status, "started_at": r.started_at.isoformat(),
                    "finished_at": r.finished_at.isoformat() if r.finished_at else None, "steps": steps,
                    "error": r.error})
    return {"items": out, "n8n": bool(N8N_WEBHOOK_URL)}


@app.get("/api/model")
def model_report():
    with SessionLocal() as s:
        m = s.scalar(select(ModelReport).where(ModelReport.name == "risk_model").order_by(desc(ModelReport.id)))
        e = s.scalar(select(ModelReport).where(ModelReport.name == "ai_eval").order_by(desc(ModelReport.id)))
        asks = s.scalar(select(func.count(AskLog.id)))
        refused = s.scalar(select(func.count(AskLog.id)).where(AskLog.refused.is_(True)))
    return {"risk_model": m.report if m else None,
            "ai_eval": {"summary": e.report["summary"], "rows": e.report["rows"]} if e else None,
            "questions_asked": asks, "questions_refused": refused}


# ------------------------------------------------------------------ backup scheduler
def _scheduler():
    """Backup for n8n: runs on the 1st of each month at 06:00 if ENABLE_SCHEDULER=1."""
    last = None
    while True:
        now = datetime.now()
        if now.day == 1 and now.hour == 6 and last != now.date():
            last = now.date()
            pipeline.run_all("schedule")
        time.sleep(600)


import os
if os.getenv("ENABLE_SCHEDULER") == "1":
    threading.Thread(target=_scheduler, daemon=True).start()
