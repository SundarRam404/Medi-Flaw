"""Step 2 - clean raw records into the records table.

Every change is written to cleaning_log so the website can show before / after.
"""
import re
from datetime import date
from rapidfuzz import process, fuzz
from sqlalchemy import select, insert, update
from .db import SessionLocal, RawRecord, Record, Company, CleaningLog
from .danger import danger_level

MON = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# ------------------------------------------------------------------ company names
SUFFIX = r"(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|P\.?\s*Ltd\.?|Ltd\.?|Limited|LLP|Inc\.?|Co\.)"


BUSINESS_WORDS = (r"^.*\b(?:Pharma|Pharmaceuticals?|Laborator(?:y|ies)|Labs?|Health ?care|Remedies|Biotech|"
                  r"Life ?Sciences?|Bio-? ?Sciences?|Formulations?|Therapeutics?|Drugs|Chemicals?|Industries|"
                  r"Enterprises|Parenterals|Medicare|Life ?care|Exports|Organics|Healthcare|Medi ?Sciences?)\b")


def company_name(raw: str) -> str:
    """'M/s. Syncom Healthcare Ltd., D-42, IIE, Sidcul...' -> 'Syncom Healthcare Ltd'"""
    if not raw:
        return "Unknown"
    s = re.sub(r"^\s*M/?s\.?\s*", "", raw.strip(), flags=re.I)
    s = re.sub(r"\s*\(.*?\)", "", s)
    s = re.split(r",|\bPlot\b|\bSurvey\b|\bVill\b|\bKhasra\b|\bH\.?No\b|\bUnit\b|\bSy\.?\s*No\b", s)[0]
    s = re.split(r"\b(?:K\.?\s*No|Near|Opp|Mouza|Village|Sector|Phase|Industrial|Road|Street|Gali|Khasra)\b|\bNo\.?\s*\d|\s\d", s, flags=re.I)[0]
    m = re.search(rf"^(.*?\b{SUFFIX})", s, re.I)
    if m:
        s = m.group(1)
    else:
        m = re.search(BUSINESS_WORDS, s, re.I)
        if m:
            s = s[:m.end()]
    s = re.sub(r"\s+", " ", s).strip(" .-&")
    s = re.sub(r"\bPvt\.?\s*Ltd\.?$|\bPrivate\s+Limited$|\bP\.?\s*Ltd\.?$", "Pvt Ltd", s, flags=re.I)
    s = re.sub(r"\bLtd\.?$|\bLimited$", "Ltd", s, flags=re.I)
    if s.isupper() or s.islower():
        s = s.title()
        s = re.sub(r"\bLlp\b", "LLP", s)
    # long all-caps words are names, not acronyms: CIPLA -> Cipla
    s = re.sub(r"\b[A-Z]{5,}\b", lambda m: m.group(0).title(), s)
    return s or "Unknown"


def name_key(name: str) -> str:
    k = name.lower()
    k = re.sub(r"\b(pvt|private|ltd|limited|p|llp|inc|co|the|m/s)\b\.?", " ", k)
    k = re.sub(r"[^a-z0-9 ]", " ", k)
    words = [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in k.split()]
    return "".join(words)   # no spaces: 'Life Science' == 'Lifesciences'



# ------------------------------------------------------------------ failure reason
CATEGORIES = [
    ("Spurious", r"spurious|not manufactured by|counterfeit"),
    ("Sterility", r"steril"),
    ("Particulate matter", r"particulate|clarity|visible particle"),
    ("Microbial", r"microbial|aerobic|contamina|pathogen|e\.?\s*coli|salmonella|bacterial endotoxin|\bbet\b"),
    ("Dissolution", r"dissolution|disintegration|drug release"),
    ("Assay / content", r"assay|content|potency|net weight|uniformity|weight variation|identification"),
    ("Related substances", r"related substance|impurit|degradation"),
    ("pH / physical", r"\bph\b|extractable volume|viscosity|friability|hardness|leak|osmolality"),
    ("Labelling", r"label|misbrand"),
    ("Description", r"description|appearance|colou?r|odou?r"),
]


def category(reason: str) -> str:
    t = (reason or "").lower()
    for name, pat in CATEGORIES:
        if re.search(pat, t):
            return name
    return "Other"


# ------------------------------------------------------------------ state from address
STATE_WORDS = [
    ("Himachal Pradesh", r"himachal|\bh\.\s?p\b|baddi|solan|nalagarh|paonta|kala amb|sirmour|una\b"),
    ("Uttarakhand", r"uttarakhand|uttaranchal|\bu\.\s?k\b|dehradun|haridwar|roorkee|selaqui|sidcul|kashipur|rudrapur|sitarganj"),
    ("Gujarat", r"gujarat|ahmedabad|vadodara|baroda|surat|rajkot|ankleshwar|vapi|gandhinagar|mehsana|bharuch|changodar|moraiya"),
    ("Maharashtra", r"maharashtra|mumbai|thane|pune|nashik|aurangabad|nagpur|tarapur|palghar|bhiwandi|ambernath|navi mumbai"),
    ("Telangana", r"telangana|hyderabad|secunderabad|medak|sangareddy|rangareddy|jeedimetla"),
    ("Andhra Pradesh", r"andhra|visakhapatnam|vizag|vijayawada|srikakulam|nellore|anakapalli"),
    ("Tamil Nadu", r"tamil ?nadu|\bt\.\s?n\b|chennai|coimbatore|madurai|hosur|salem|trichy|kanchipuram|chengalpattu"),
    ("Karnataka", r"karnataka|bangalore|bengaluru|mysore|mysuru|hubli|belgaum|dharwad"),
    ("Punjab", r"punjab|mohali|derabassi|dera bassi|ludhiana|amritsar|jalandhar|lalru"),
    ("Haryana", r"haryana|panchkula|gurgaon|gurugram|faridabad|ambala|sonipat|karnal|bahadurgarh|panipat"),
    ("Uttar Pradesh", r"uttar pradesh|\bu\.\s?p\b|noida|ghaziabad|lucknow|kanpur|meerut|agra|saharanpur"),
    ("Madhya Pradesh", r"madhya pradesh|\bm\.\s?p\b|indore|pithampur|bhopal|dewas|jabalpur|malanpur|gwalior"),
    ("Rajasthan", r"rajasthan|jaipur|bhiwadi|alwar|udaipur|jodhpur|neemrana"),
    ("West Bengal", r"west bengal|\bw\.\s?b\b|kolkata|calcutta|howrah|hooghly"),
    ("Delhi", r"\bdelhi\b"),
    ("Kerala", r"kerala|kochi|ernakulam|thrissur|trivandrum|thiruvananthapuram|palakkad"),
    ("Goa", r"\bgoa\b|verna|madgaon|ponda"),
    ("Sikkim", r"sikkim|gangtok"),
    ("Jammu & Kashmir", r"jammu|kashmir|kathua|samba|\bj\s?&\s?k\b"),
    ("Assam", r"assam|guwahati"),
    ("Bihar", r"bihar|patna|hajipur"),
    ("Jharkhand", r"jharkhand|ranchi|jamshedpur"),
    ("Odisha", r"odisha|orissa|bhubaneswar|cuttack"),
    ("Chhattisgarh", r"chhattisgarh|raipur|bilaspur"),
    ("Puducherry", r"puducherry|pondicherry"),
    ("Daman, Dadra & Nagar Haveli", r"daman|silvassa|dadra"),
    ("Chandigarh", r"chandigarh"),
]
PIN2 = {"11": "Delhi", "12": "Haryana", "13": "Haryana", "14": "Punjab", "15": "Punjab", "16": "Punjab",
        "17": "Himachal Pradesh", "18": "Jammu & Kashmir", "19": "Jammu & Kashmir",
        "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan",
        "36": "Gujarat", "37": "Gujarat", "38": "Gujarat", "39": "Gujarat",
        "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra", "44": "Maharashtra",
        "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh",
        "49": "Chhattisgarh", "50": "Telangana", "51": "Andhra Pradesh", "52": "Andhra Pradesh",
        "53": "Andhra Pradesh", "56": "Karnataka", "57": "Karnataka", "58": "Karnataka", "59": "Karnataka",
        "60": "Tamil Nadu", "61": "Tamil Nadu", "62": "Tamil Nadu", "63": "Tamil Nadu", "64": "Tamil Nadu",
        "67": "Kerala", "68": "Kerala", "69": "Kerala", "70": "West Bengal", "71": "West Bengal",
        "72": "West Bengal", "73": "West Bengal", "74": "West Bengal", "75": "Odisha", "76": "Odisha",
        "77": "Odisha", "78": "Assam", "80": "Bihar", "81": "Jharkhand", "82": "Jharkhand", "83": "Jharkhand",
        "84": "Bihar", "85": "Bihar"}


def state_from_address(addr: str) -> str | None:
    t = (addr or "").lower()
    for name, pat in STATE_WORDS:
        if re.search(pat, t):
            return name
    pins = re.findall(r"\b(\d{3})\s?(\d{3})\b", t)
    if pins:
        p = "".join(pins[-1])
        if p[:3] in ("246", "247", "248", "249", "262", "263"):
            return "Uttarakhand"
        if p.startswith("403"):
            return "Goa"
        if p.startswith("396"):
            return "Daman, Dadra & Nagar Haveli"
        if p[:2] in ("20", "21", "22", "23", "24", "25", "26", "27", "28"):
            return "Uttar Pradesh"
        return PIN2.get(p[:2])
    return None


# ------------------------------------------------------------------ small fields
def month_date(s: str | None) -> date | None:
    if not s:
        return None
    t = s.strip().lower()
    m = re.search(r"([a-z]{3})[a-z]*[\s\-./,]*'?(\d{2,4})", t)
    if m and m.group(1) in MON:
        y = int(m.group(2))
        y = y + 2000 if y < 100 else y
        if 1990 < y < 2100:
            return date(y, MON[m.group(1)], 1)
    m = re.search(r"(\d{1,2})[\-/.](\d{2,4})$", t)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        y = y + 2000 if y < 100 else y
        if 1 <= mo <= 12 and 1990 < y < 2100:
            return date(y, mo, 1)
    return None


def batch_norm(b: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (b or "").upper())


def source_norm(s: str | None) -> str | None:
    t = (s or "").lower()
    if "cdsco" in t:
        return "CDSCO lab"
    if "state" in t:
        return "State lab"
    return s.strip() if s else None


def lab_norm(s: str | None) -> str | None:
    if not s:
        return None
    t = re.sub(r"\s*,\s*", " ", s.strip())
    return re.sub(r"\s+", " ", t)


def tidy(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


# ------------------------------------------------------------------ main
def run(run_id=None) -> dict:
    """Two passes so the database is called a few times in big batches
    (important when the database is in the cloud)."""
    with SessionLocal() as s:
        raws = s.scalars(select(RawRecord).where(RawRecord.processed.is_(False)).order_by(RawRecord.id)).all()
        if not raws:
            return {"processed": 0, "added": 0, "duplicates": 0, "new_companies": 0, "new_record_ids": []}

        companies = {c.name_key: c for c in s.scalars(select(Company)).all()}
        id_to_key = {c.id: k for k, c in companies.items()}
        keys = list(companies.keys())
        seen = {(id_to_key.get(r.company_id), r.drug_name.lower(), r.batch_norm)
                for r in s.execute(select(Record.company_id, Record.drug_name, Record.batch_norm)).all()}
        logs, rows, dups, new = [], [], 0, []

        def log(raw_id, field, before, after, rule):
            if (before or "") != (after or ""):
                logs.append(dict(raw_id=raw_id, field=field, before=before, after=after, rule=rule))

        # pass 1: work out the company for every row (no database calls)
        resolved = []
        for raw in raws:
            name = company_name(raw.manufacturer_raw)
            key = name_key(name) or "unknown"
            rule = "Removed address and M/s prefix"
            if key in companies and companies[key].name != name:
                old = companies[key]
                if name not in old.aliases:
                    old.aliases = old.aliases + [name]
                rule = f"Same company as '{old.name}', written differently"
            elif key not in companies and keys:
                hit = process.extractOne(key, keys, scorer=fuzz.ratio, score_cutoff=95)
                if hit and hit[0][:3] == key[:3]:
                    old = companies[hit[0]]
                    if name not in old.aliases and name != old.name:
                        old.aliases = old.aliases + [name]
                    key, rule = hit[0], f"Merged with similar name '{old.name}'"
            if key not in companies:
                c = Company(name=name, name_key=key, aliases=[], state=state_from_address(raw.manufacturer_raw))
                companies[key] = c
                keys.append(key)
                new.append(c)
            resolved.append((raw, key, rule))

        s.add_all(new)
        s.flush()          # one batch insert for all new companies

        # pass 2: build cleaned rows
        for raw, key, rule in resolved:
            co = companies[key]
            log(raw.id, "manufacturer", raw.manufacturer_raw, co.name, rule)
            drug = tidy(raw.drug_name)
            bn = batch_norm(raw.batch_no)
            k = (key, drug.lower(), bn)
            if k in seen:
                dups += 1
                log(raw.id, "row", f"{drug} / {raw.batch_no}", "(removed)", "Duplicate of an earlier row")
                continue
            seen.add(k)

            cat = category(raw.failure_reason)
            lvl, note = danger_level(cat, drug)
            rm = month_date(raw.reporting_month) or month_date(raw.source_month)
            state = state_from_address(raw.manufacturer_raw) or co.state
            src, lab = source_norm(raw.reporting_source), lab_norm(raw.testing_lab)
            mfg, exp = month_date(raw.mfg_date), month_date(raw.expiry_date)

            log(raw.id, "failure_reason", raw.failure_reason, cat, "Grouped into a failure type")
            log(raw.id, "drug_name", raw.drug_name, drug, "Removed extra spaces")
            log(raw.id, "batch_no", raw.batch_no, bn, "Upper case, removed spaces and symbols for matching")
            log(raw.id, "reporting_source", raw.reporting_source, src, "Same source written differently")
            log(raw.id, "testing_lab", raw.testing_lab, lab, "Same lab written differently")
            log(raw.id, "mfg_date", raw.mfg_date, mfg.isoformat() if mfg else None, "Text date to real date")
            log(raw.id, "expiry_date", raw.expiry_date, exp.isoformat() if exp else None, "Text date to real date")
            log(raw.id, "state", None, state, "State read from the address")

            rows.append(dict(raw_id=raw.id, company_id=co.id, drug_name=drug, batch_no=tidy(raw.batch_no),
                             batch_norm=bn, mfg_date=mfg, expiry_date=exp, manufacturer=co.name, state=state,
                             failure_reason=tidy(raw.failure_reason) or "Not given", category=cat, danger=lvl,
                             danger_note=note, reporting_source=src, testing_lab=lab, report_month=rm))

        ids = []
        for i in range(0, len(rows), 1000):
            ids += s.scalars(insert(Record).returning(Record.id), rows[i:i + 1000]).all()
        for i in range(0, len(logs), 2000):
            s.execute(insert(CleaningLog), logs[i:i + 2000])
        raw_ids = [r.id for r in raws]
        for i in range(0, len(raw_ids), 5000):
            s.execute(update(RawRecord).where(RawRecord.id.in_(raw_ids[i:i + 5000])).values(processed=True))
        s.commit()
    return {"processed": len(raws), "added": len(ids), "duplicates": dups,
            "new_companies": len(new), "new_record_ids": ids}
