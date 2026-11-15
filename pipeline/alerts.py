"""Step 5 - match new failed batches against every shop's watchlist and send emails.
If Gmail is not set up, emails are kept in the outbox (alerts table) and shown on the site."""
import secrets, smtplib, threading
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


def alert_text(user: User, rec: Record, token: str, taken_by: str | None = None) -> tuple[str, str]:
    if (user.account_type or "business") == "personal":
        return personal_text(user, rec, token, taken_by)
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


def personal_text(user: User, rec: Record, token: str, taken_by: str | None) -> tuple[str, str]:
    who = f" ({taken_by})" if taken_by else ""
    subject = f"A medicine you saved{who} failed a government quality test"
    body = f"""Hello {user.name},

A medicine on your Medi-Flaw list{who} is in the latest government (CDSCO) list of
medicines that failed a quality test.

  Medicine      : {rec.drug_name}
  Batch number  : {rec.batch_no}
  Made by       : {rec.manufacturer}
  What failed   : {rec.failure_reason}
  How serious   : {rec.danger} - {rec.danger_note}

What to do
  1. Do not stop the medicine suddenly. Call your doctor or pharmacist today and ask
     for the same medicine from a different batch.
  2. Take the strip back to the shop. A short note to show them is on this page:
     {APP_URL}/batch/{rec.batch_norm}
  3. Tap here to tell us you have seen this (then we will not remind you):
     {APP_URL}/ack/{token}

Medi-Flaw - Making Medicine Quality Transparent
(Based only on the official CDSCO list. This is not medical advice.)
"""
    return subject, body


def staff_emails(user: User) -> list[str]:
    if (user.account_type or "business") != "business":
        return []
    return [e for e in (user.extra_emails or []) if e and e.lower() != (user.email or "").lower()][:3]


_run_lock = threading.Lock()


def run(run_id=None, record_ids: list[int] | None = None) -> dict:
    """Check the given new records (or all records) against all watchlists.
    One check at a time in this process, so the daily run and a pharmacist adding a
    medicine can never both send the same alert."""
    with _run_lock:
        return _run(run_id, record_ids)


def _digest(user: User, parts: list[tuple[str, str]]) -> tuple[str, str]:
    """Several failed batches for one person become one email instead of many."""
    if len(parts) == 1:
        return parts[0]
    n = len(parts)
    personal = (user.account_type or "business") == "personal"
    subject = (f"{n} medicines you saved failed a government quality test" if personal
               else f"{n} batches on your list failed a CDSCO quality test")
    blocks = []
    for i, (_, body) in enumerate(parts, 1):
        lines = body.split("\n")
        # keep each email's details and links, drop the repeated greeting and sign-off
        core = [l for l in lines if not l.startswith("Hello ") and not l.startswith("Medi-Flaw")
                and not l.startswith("(This alert") and not l.startswith("(Based only")]
        blocks.append(f"---------- {i} of {n} ----------\n" + "\n".join(core).strip())
    body = f"Hello {user.name},\n\n{n} items on your Medi-Flaw list appear in the official CDSCO list of medicines\n" \
           f"that are Not of Standard Quality. Details for each are below.\n\n" + "\n\n".join(blocks) + \
           "\n\nMedi-Flaw - Making Medicine Quality Transparent\n" \
           "(Based only on the official CDSCO list. Please check the original list before acting.)\n"
    return subject, body


def _run(run_id=None, record_ids: list[int] | None = None) -> dict:
    sent = outbox = failed = 0
    with SessionLocal() as s:
        q = select(WatchItem, Record).join(Record, Record.batch_norm == WatchItem.batch_norm) \
            .where(WatchItem.status != "returned")
        if record_ids is not None:
            if not record_ids:
                return {"matched": 0, "sent": 0, "outbox": 0, "failed": 0}
            q = q.where(Record.id.in_(record_ids))
        existing = {(a.watch_id, a.record_id): a for a in s.scalars(select(Alert)).all()}
        matched = 0
        from .matching import same_batch
        per_user: dict[int, list] = {}
        for w, rec in s.execute(q).all():
            prev = existing.get((w.id, rec.id))
            # already delivered (or saved / switched off): skip. Failed earlier: try again now.
            if (prev and prev.delivery != "failed") or not same_batch(w.manufacturer, w.drug_name, rec)[0]:
                continue
            matched += 1
            per_user.setdefault(w.user_id, []).append((w, rec, prev))

        for uid, items in per_user.items():
            user = s.get(User, uid)
            rows, parts = [], []
            for w, rec, prev in items:
                token = prev.token if prev else secrets.token_urlsafe(16)
                subj, body = alert_text(user, rec, token, getattr(w, "taken_by", None))
                parts.append((subj, body))
                rows.append((w, rec, prev, token, subj, body))
            subject, body = _digest(user, parts)
            if user.email_alerts is not False:
                status = send_email(user.email, subject, body)
                if status == "sent":
                    for extra in staff_emails(user):  # owner/staff copies, best effort
                        send_email(extra, subject, body)
            else:
                status = "off"
            n = len(rows)
            sent += n if status == "sent" else 0
            outbox += n if status == "outbox" else 0
            failed += n if status == "failed" else 0
            for w, rec, prev, token, subj, b in rows:
                if prev:  # retry of an earlier failed send
                    prev.delivery, prev.sent_at, prev.run_id, prev.subject, prev.body = status, utcnow(), run_id, subj, b
                else:
                    s.add(Alert(user_id=user.id, watch_id=w.id, record_id=rec.id, run_id=run_id, to_email=user.email,
                                subject=subj, body=b, delivery=status, token=token))
        s.commit()
    return {"matched": matched, "sent": sent, "outbox": outbox, "failed": failed}


def followups(run_id=None, days: int | None = None) -> dict:
    """Reminder for alerts nobody confirmed."""
    days = FOLLOWUP_DAYS if days is None else days
    cutoff = utcnow() - timedelta(days=days)
    n = 0
    with SessionLocal() as s:
        # Remind only when the first email actually arrived, and only people who still want email.
        # Reminding failed or switched-off alerts means mail to dead addresses, and bounces hurt delivery.
        due = s.scalars(select(Alert).join(User, User.id == Alert.user_id)
                        .where(Alert.acknowledged_at.is_(None), Alert.followup_at.is_(None),
                               Alert.sent_at <= cutoff, Alert.delivery == "sent",
                               User.email_alerts.is_not(False))).all()
        by_user: dict[int, list] = {}
        for a in due:
            by_user.setdefault(a.user_id, []).append(a)
        for uid, items in by_user.items():  # one reminder email per person, however many alerts
            u = s.get(User, uid)
            if not u:
                continue
            subject, body = _digest(u, [(a.subject, a.body) for a in items])
            body = f"Reminder: you have not confirmed {'this alert' if len(items) == 1 else 'these alerts'} yet.\n\n{body}"
            if send_email(u.email, "Reminder: " + subject, body) != "sent":
                continue  # try again on the next run
            for extra in staff_emails(u):
                send_email(extra, "Reminder: " + subject, body)
            for a in items:
                a.followup_at = utcnow()
            n += len(items)
        s.commit()
    return {"reminders": n, "after_days": days}
