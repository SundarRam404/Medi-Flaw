"""Delete test accounts. Keeps the admin (ADMIN_EMAIL in .env) and any emails given with --keep.

Run from the Medi-Flaw folder:
    .venv/bin/python tools/clean_users.py --keep mediflaw@gmail.com

It first prints every account and what will happen to it, and deletes nothing
until you type DELETE. Their medicines, alerts, codes and activity go too.
"""
import argparse
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

ap = argparse.ArgumentParser()
ap.add_argument("--keep", action="append", default=[], help="email to keep (can repeat)")
args = ap.parse_args()

admin = os.getenv("ADMIN_EMAIL", "").strip().lower()
keep = {e.strip().lower() for e in args.keep if e.strip()}
if admin:
    keep.add(admin)
url = os.environ["DATABASE_URL"]
for a, b in (("postgresql+psycopg://", "postgresql://"), ("postgres://", "postgresql://")):
    if url.startswith(a):
        url = b + url[len(a):]

with psycopg.connect(url, connect_timeout=20) as con:
    rows = con.execute("""
        select u.id, u.email, u.name, u.role, coalesce(u.auth_provider, 'password'),
               (select count(*) from watchlist w where w.user_id = u.id),
               (select count(*) from alerts a where a.user_id = u.id)
        from users u order by u.id""").fetchall()

    print(f"\n{'':6}{'email':38}{'role':12}{'sign-in':17}{'medicines':>10}{'alerts':>8}")
    gone = []
    for uid, email, name, role, prov, meds, alerts in rows:
        k = email.lower() in keep or role == "admin"
        if not k:
            gone.append(uid)
        print(f"{'KEEP  ' if k else 'DELETE'}{email:38}{role:12}{prov:17}{meds:>10}{alerts:>8}")

    if not gone:
        print("\nNothing to delete.")
        sys.exit(0)
    print(f"\n{len(gone)} account(s) and all their medicines, alerts and activity will be deleted.")
    print("This cannot be undone.")
    if input("Type DELETE to continue: ").strip() != "DELETE":
        print("Cancelled. Nothing was deleted.")
        sys.exit(0)

    with con.transaction():
        emails = [r[1].lower() for r in rows if r[0] in gone]
        n_al = con.execute("delete from alerts where user_id = any(%s)", (gone,)).rowcount
        n_w = con.execute("delete from watchlist where user_id = any(%s)", (gone,)).rowcount
        for sql, arg in (("delete from auth_events where user_id = any(%s)", gone),
                         ("delete from email_codes where lower(email) = any(%s)", emails)):
            try:
                with con.transaction():  # savepoint: a missing new table must not undo the rest
                    con.execute(sql, (arg,))
            except psycopg.errors.UndefinedTable:
                pass
        n_u = con.execute("delete from users where id = any(%s)", (gone,)).rowcount
    print(f"Done. Deleted {n_u} accounts, {n_w} medicines, {n_al} alerts.")
