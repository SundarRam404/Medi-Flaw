"""Fill one account with demo medicines (some failed, some clean) and send the alert email.

Run from the Medi-Flaw folder:
    .venv/bin/python tools/demo_stock.py sundar.csrm@gmail.com
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import select, desc  # noqa: E402
from pipeline.db import SessionLocal, User, WatchItem, Record  # noqa: E402
from pipeline import alerts  # noqa: E402

if len(sys.argv) < 2:
    sys.exit("Usage: .venv/bin/python tools/demo_stock.py you@gmail.com")
email = sys.argv[1].strip().lower()

SUPPLIERS = ["Sri Balaji Pharma Distributors", "Chennai Medical Agencies", "Lakshmi Drug House"]
# realistic clean stock (batch numbers that are not in any failed list)
CLEAN = [
    ("Dolo 650 Tablets", "Micro Labs Ltd", "DOBT4521"), ("Pan 40 Tablets", "Alkem Laboratories Ltd", "PNA2C118"),
    ("Augmentin 625 Duo", "GlaxoSmithKline Pharmaceuticals Ltd", "AG7K0931"), ("Crocin Advance", "Haleon India", "CRA30472"),
    ("Azithral 500", "Alembic Pharmaceuticals Ltd", "AZL61207"), ("Montair LC", "Cipla Ltd", "MLC24B655"),
    ("Thyronorm 50 mcg", "Abbott India Ltd", "THN50R882"), ("Shelcal 500", "Torrent Pharmaceuticals Ltd", "SHC9D7714"),
]

with SessionLocal() as s:
    u = s.scalar(select(User).where(User.email == email))
    if not u:
        sys.exit(f"No account for {email}. Sign up on the website first, then run this again.")
    have = set(s.scalars(select(WatchItem.batch_norm).where(WatchItem.user_id == u.id)).all())

    # 8 real failed batches from the latest lists, mixed danger levels
    failed, seen_cat = [], set()
    for r in s.scalars(select(Record).order_by(desc(Record.report_month), Record.id).limit(400)).all():
        key = (r.danger, r.category)
        if r.batch_norm in have or key in seen_cat or not r.drug_name:
            continue
        seen_cat.add(key)
        failed.append(r)
        if len(failed) == 8:
            break

    today, added = date.today(), 0
    for i, r in enumerate(failed):
        s.add(WatchItem(user_id=u.id, batch_no=r.batch_no, batch_norm=r.batch_norm, drug_name=r.drug_name,
                        manufacturer=r.manufacturer, quantity=[20, 50, 10, 100, 30, 60, 15, 40][i],
                        purchased_on=today - timedelta(days=10 + 7 * i), supplier=SUPPLIERS[i % 3],
                        source="manual", taken_by="Amma" if i % 2 else "Me"))
        added += 1
    for i, (name, maker, b) in enumerate(CLEAN):
        if b in have:
            continue
        s.add(WatchItem(user_id=u.id, batch_no=b, batch_norm=b, drug_name=name, manufacturer=maker,
                        quantity=[100, 60, 30, 80, 40, 50, 90, 70][i], purchased_on=today - timedelta(days=5 + 6 * i),
                        supplier=SUPPLIERS[(i + 1) % 3], source="manual", taken_by=["Appa", "Me", "Paati"][i % 3]))
        added += 1
    s.commit()

print(f"Added {added} medicines to {email} ({len(failed)} failed, the rest clean).")
for r in failed:
    print(f"  FAILED  {r.batch_no:14} {r.danger:6} {r.drug_name[:50]}")
print("Sending the alert email...")
print(alerts.run(None, None))
print("Done. Check the inbox (and Spam the first time).")
