"""Step 5 - match new failed batches against every shop's watchlist and send emails.
If Gmail is not set up, emails are kept in the outbox (alerts table) and shown on the site."""
import secrets, smtplib
import requests
from datetime import datetime, timedelta
from email.message import EmailMessage
from sqlalchemy import select
from .db import utcnow, SessionLocal, Record, WatchItem, Alert, User
from .config import (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM, MAIL_FROM_NAME,
                     BREVO_API_KEY, APP_URL, FOLLOWUP_DAYS)


def _send_brevo(to: str, subject: str, body: str) -> str:
    r = requests.post("https://api.brevo.com/v3/smtp/email", timeout=15,
                      headers={"api-key": BREVO_API_KEY, "accept": "application/json"},
                      json={"sender": {"name": MAIL_FROM_NAME, "email": MAIL_FROM},
                            "to": [{"email": to}], "subject": subject, "textContent": body})
    if r.status_code in (200, 201, 202):
        return "sent"
    print(f"Brevo send failed {r.status_code}: {r.text[:300]}", flush=True)
    return "failed"


def send_email(to: str, subject: str, body: str) -> str:
    """Brevo (HTTPS) if configured, otherwise Gmail SMTP. Returns sent / failed / outbox."""
    if BREVO_API_KEY and MAIL_FROM:
        try:
            return _send_brevo(to, subject, body)
        except Exception as e:
            print(f"Brevo error: {type(e).__name__}: {e}", flush=True)
            return "failed"
    if not (SMTP_USER and SMTP_PASSWORD):
        return "outbox"
    try:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = MAIL_FROM, to, subject
        msg.set_content(body)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
        return "sent"
    except Exception as e:
        print(f"SMTP error: {type(e).__name__}: {e}", flush=True)
        return "failed"


def alert_text(user: User, rec: Record, token: str) -> tuple[str, str]:
    subject = f"Batch {rec.batch_no} on your list failed a CDSCO quality test"
    body = f"""Hello {user.name},

A batch on your Medi-Flaw watchlist appears in the latest CDSCO list of medicines
that are Not of Standard Quality.

  Medicine      : {rec.drug_name}
  Batch number  : {rec.batch_no}
  Manufacturer  : {rec.manufacturer}
  Test failed   : {rec.failure_reason}
  Danger level  : {rec.danger} - {rec.danger_note}
  CDSCO list    : {rec.report_month:%B %Y}
  Tested by     : {rec.testing_lab or '-'}

What to do
  1. Stop selling this batch and keep it aside.
  2. Return it to your distributor. A ready return letter is here:
     {APP_URL}/letter/{rec.id}
  3. Confirm you have seen this alert:
     {APP_URL}/ack/{token}

Record: {APP_URL}/batch/{rec.batch_norm}

Medi-Flaw
(This alert is based only on the official CDSCO list. Please check the original list before acting.)
"""
    return subject, body


def run(run_id=None, record_ids: list[int] | None = None) -> dict:
    """Check the given new records (or all records) against all watchlists."""
    sent = outbox = failed = 0
    with SessionLocal() as s:
        q = select(WatchItem, Record).join(Record, Record.batch_norm == WatchItem.batch_norm) \
            .where(WatchItem.status != "returned")
        if record_ids is not None:
            if not record_ids:
                return {"matched": 0, "sent": 0, "outbox": 0, "failed": 0}
            q = q.where(Record.id.in_(record_ids))
        done = {(a.watch_id, a.record_id) for a in s.scalars(select(Alert)).all()}
        matched = 0
        from .matching import same_batch
        for w, rec in s.execute(q).all():
            if (w.id, rec.id) in done or not same_batch(w.manufacturer, w.drug_name, rec)[0]:
                continue
            matched += 1
            user = s.get(User, w.user_id)
            token = secrets.token_urlsafe(16)
            subject, body = alert_text(user, rec, token)
            status = send_email(user.email, subject, body) if user.email_alerts is not False else "off"
            sent += status == "sent"
            outbox += status == "outbox"
            failed += status == "failed"
            s.add(Alert(user_id=user.id, watch_id=w.id, record_id=rec.id, run_id=run_id, to_email=user.email,
                        subject=subject, body=body, delivery=status, token=token))
        s.commit()
    return {"matched": matched, "sent": sent, "outbox": outbox, "failed": failed}


def followups(run_id=None, days: int | None = None) -> dict:
    """Reminder for alerts nobody confirmed."""
    days = FOLLOWUP_DAYS if days is None else days
    cutoff = utcnow() - timedelta(days=days)
    n = 0
    with SessionLocal() as s:
        due = s.scalars(select(Alert).where(Alert.acknowledged_at.is_(None), Alert.followup_at.is_(None),
                                            Alert.sent_at <= cutoff)).all()
        for a in due:
            body = f"Reminder: you have not confirmed this alert yet.\n\n{a.body}"
            send_email(a.to_email, "Reminder: " + a.subject, body)
            a.followup_at = utcnow()
            n += 1
        s.commit()
    return {"reminders": n, "after_days": days}
