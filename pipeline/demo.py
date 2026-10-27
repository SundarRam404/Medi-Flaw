"""Demo pharmacy account with 6 months of purchases.

Login: pharmacy@pharmaaudit.in / Pharmacy@123
Some batches are already in CDSCO failed lists, two more fail when the held-back
July 2026 list is loaded by the monthly run.
"""
import random, re
from datetime import date
import pandas as pd
from sqlalchemy import select, text
from .db import SessionLocal, engine, User, WatchItem
from .config import INCOMING_DIR

DEMO_EMAIL = "pharmacy@pharmaaudit.in"
DEMO_PASSWORD = "Pharmacy@123"

SAFE = [
    ("Paracetamol Tablets IP 650 mg", "Micro Labs Ltd"), ("Paracetamol Tablets IP 500 mg", "GSK Pharmaceuticals Ltd"),
    ("Azithromycin Tablets IP 500 mg", "Alembic Pharmaceuticals Ltd"), ("Amoxicillin Capsules IP 500 mg", "Alkem Laboratories Ltd"),
    ("Cetirizine Tablets IP 10 mg", "Dr. Reddy's Laboratories Ltd"), ("Pantoprazole Gastro-resistant Tablets 40 mg", "Sun Pharmaceutical Industries Ltd"),
    ("Metformin Tablets IP 500 mg", "USV Pvt Ltd"), ("Amlodipine Tablets IP 5 mg", "Cipla Ltd"),
    ("Atorvastatin Tablets IP 10 mg", "Zydus Lifesciences Ltd"), ("Telmisartan Tablets IP 40 mg", "Glenmark Pharmaceuticals Ltd"),
    ("Montelukast & Levocetirizine Tablets", "Torrent Pharmaceuticals Ltd"), ("Ondansetron Tablets 4 mg", "Intas Pharmaceuticals Ltd"),
    ("Ibuprofen Tablets IP 400 mg", "Abbott India Ltd"), ("Diclofenac Gel 1%", "Novartis India Ltd"),
    ("ORS Powder (WHO formula)", "FDC Ltd"), ("Vitamin D3 Capsules 60000 IU", "Mankind Pharma Ltd"),
    ("Calcium & Vitamin D3 Tablets", "Lupin Ltd"), ("Ferrous Ascorbate & Folic Acid Tablets", "Emcure Pharmaceuticals Ltd"),
    ("Cough Syrup (Dextromethorphan) 100 ml", "Piramal Pharma Ltd"), ("Domperidone Tablets IP 10 mg", "Ipca Laboratories Ltd"),
    ("Ranitidine Tablets 150 mg", "J.B. Chemicals Ltd"), ("Levocetirizine Tablets 5 mg", "Macleods Pharmaceuticals Ltd"),
    ("Cefixime Tablets 200 mg", "Hetero Labs Ltd"), ("Ciprofloxacin Tablets IP 500 mg", "Aristo Pharmaceuticals Pvt Ltd"),
    ("Losartan Potassium Tablets 50 mg", "Unichem Laboratories Ltd"), ("Glimepiride Tablets 2 mg", "Sanofi India Ltd"),
    ("Insulin Glargine Injection 100 IU/ml", "Biocon Ltd"), ("Salbutamol Inhaler 100 mcg", "Cipla Ltd"),
    ("Multivitamin Syrup 200 ml", "Mankind Pharma Ltd"), ("Omeprazole Capsules 20 mg", "Dr. Reddy's Laboratories Ltd"),
    ("Clopidogrel Tablets 75 mg", "Sun Pharmaceutical Industries Ltd"), ("Rosuvastatin Tablets 10 mg", "Torrent Pharmaceuticals Ltd"),
    ("Metoprolol Succinate ER Tablets 50 mg", "AstraZeneca Pharma India Ltd"), ("Prednisolone Tablets 10 mg", "Wockhardt Ltd"),
    ("Albendazole Tablets 400 mg", "Mankind Pharma Ltd"), ("Fluconazole Tablets 150 mg", "Alkem Laboratories Ltd"),
    ("Betadine Ointment 5%", "Win-Medicare Pvt Ltd"), ("Normal Saline IV 500 ml", "Baxter India Pvt Ltd"),
    ("Dexamethasone Injection 4 mg/ml", "Zydus Lifesciences Ltd"), ("Ceftriaxone Injection 1 g", "Lupin Ltd"),
    ("Paracetamol Suspension 120 mg/5 ml", "Cipla Ltd"), ("Hydroxychloroquine Tablets 200 mg", "Ipca Laboratories Ltd"),
    ("Levothyroxine Tablets 50 mcg", "Abbott India Ltd"), ("Vildagliptin Tablets 50 mg", "Glenmark Pharmaceuticals Ltd"),
]
SUPPLIERS = ["Chennai Pharma Distributors", "Sri Balaji Medical Agencies", "Kumaran Pharma Wholesale", "Velachery Medical Agencies"]
MONTHS = [date(2026, m, 1) for m in range(5, 11)]   # May to October 2026


def _norm(b):
    return re.sub(r"[^A-Z0-9]", "", (b or "").upper())


def _held_back_rows():
    for pattern in ("cdsco_2026-07.csv", "cdsco_2026-07.done"):
        f = INCOMING_DIR / pattern
        if f.exists():
            return pd.read_csv(f, dtype=str)
    return pd.DataFrame()


def seed_demo_pharmacy(hash_pw) -> bool:
    rng = random.Random(42)
    with SessionLocal() as s:
        if s.scalar(select(User).where(User.email == DEMO_EMAIL)):
            return False
        u = User(email=DEMO_EMAIL, name="Sri Ram Medicals", organisation="Sri Ram Medicals, Velachery, Chennai",
                 role="pharmacist", password_hash=hash_pw(DEMO_PASSWORD), email_alerts=True)
        s.add(u)
        s.flush()
        taken = set()

        def add(drug, batch, maker, kind, bought=None):
            n = _norm(batch)
            if not n or n in taken:
                return
            taken.add(n)
            m = rng.choice(MONTHS)
            s.add(WatchItem(user_id=u.id, batch_no=batch, batch_norm=n, drug_name=drug, manufacturer=maker,
                            quantity=rng.choice([20, 30, 50, 60, 100, 120, 150, 200, 300]),
                            purchased_on=bought or date(m.year, m.month, rng.randint(1, 28)),
                            supplier=rng.choice(SUPPLIERS), source="demo", status="in_stock", note=kind))

        # 5 batches bought in May 2026 that then appear in the June 2026 CDSCO list
        with engine.connect() as con:
            rows = con.execute(text(
                "select distinct on (company_id) drug_name, batch_no, manufacturer, report_month from records "
                "where report_month = (select max(report_month) from records where report_month < '2026-07-01') "
                "and danger in ('HIGH','MEDIUM') and length(drug_name) < 70 "
                "order by company_id, (drug_name ilike any(array['%paracetamol%','%amoxicillin%','%pantoprazole%',"
                "'%cetirizine%','%metformin%','%azithromycin%','%sodium chloride%'])) desc limit 5"
            )).all()
            failed_norms = set(con.execute(text("select batch_norm from records")).scalars().all())

        def bought_before(list_month: date):
            # bought 2 to 6 weeks before the list came out
            m = list_month.year * 12 + list_month.month - 2
            d = date(m // 12, m % 12 + 1, rng.randint(1, 28))
            return max(d, date(2026, 5, 1))

        for d, b, mk, rm in rows:
            add(d, b, mk, "in June list", bought_before(rm))
        # 2 batches bought in May/June that appear in the July 2026 list (held back for the demo run)
        from .clean import company_name
        hb = _held_back_rows()
        for r in hb.iloc[2:4].itertuples():
            add(r.drug_name, r.batch_no, company_name(str(r.manufacturer_raw)), "in July list",
                date(2026, rng.choice([5, 6]), rng.randint(1, 28)))
        # the rest: normal stock with no failure on record
        for drug, maker in SAFE:
            for _ in range(10):
                b = f"{rng.choice('ABCDEFGHKLMNPRST')}{rng.choice('ABCDEFGHKLMNPRST')}{rng.randint(24, 26)}{rng.randint(1000, 9999)}"
                if _norm(b) not in failed_norms:
                    add(drug, b, maker, None)
                    break
        s.commit()
    return True


def reset_demo_pharmacy(hash_pw):
    """Delete and rebuild the demo pharmacy account."""
    with SessionLocal() as s:
        u = s.scalar(select(User).where(User.email == DEMO_EMAIL))
        if u:
            s.execute(text("delete from alerts where user_id = :u"), {"u": u.id})
            s.execute(text("delete from watchlist where user_id = :u"), {"u": u.id})
            s.execute(text("delete from users where id = :u"), {"u": u.id})
            s.commit()
    return seed_demo_pharmacy(hash_pw)
