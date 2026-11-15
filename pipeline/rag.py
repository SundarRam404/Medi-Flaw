"""Question answering over our own records.

1. Find matching text: exact matches (batch numbers, company names, years, months)
   plus similarity search (ChromaDB; TF-IDF if Chroma is not available).
2. Send only those texts to the language model (Groq, Ollama as backup).
3. The model must cite the source ids. Answers without valid sources are refused.
"""
import json, re, time
from collections import Counter
import httpx
import pandas as pd
from rapidfuzz import fuzz
from sqlalchemy import select
from .db import SessionLocal, engine, AskLog
from .config import (DATA_DIR, CHROMA_DIR, RAG_DOCS_DIR, GROQ_API_KEY, GROQ_MODEL,
                     GEMINI_API_KEY, GEMINI_MODEL, LLM_ORDER, OLLAMA_URL, OLLAMA_MODEL, SEARCH_ENGINE)

DOCS_FILE = DATA_DIR / "search_docs.json"
REFUSAL = "No evidence found in Medi-Flaw records."
MEDICAL = re.compile(r"\b(dose|dosage|should i (take|stop|give)|side effects?|treat(ment)?|cure|"
                     r"pregnan|prescri|how much .* take)\b", re.I)
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def _m(d) -> str:
    d = pd.Timestamp(d)
    return f"{MONTHS[d.month - 1]} {d.year}"


def _top(counter: Counter, n=5) -> str:
    return ", ".join(f"{k} ({v})" for k, v in counter.most_common(n))


# ------------------------------------------------------------------ documents

FORM_WORDS = set("""tablets tablet tabs tab ip bp usp mg ml injection inj capsules capsule caps syrup suspension
oral solution cream gel ointment drops eye ear nasal and with of for the infusion powder sachet film coated
sustained release extended prolonged dispersible chewable hydrochloride sodium potassium w/v v/v gm g mcg
i.p b.p i.p. b.p. sr er xr cr dt md forte plus kit vial ampoule bottle strip pack spray lotion paediatric
pediatric adult granules sterile water for disposable gastro resistant enteric delayed hcl colour liquid
orally expectorant emulsion hypodermic alpha methyl succinate citrate maleate propionate sucrose needle
syringe single use only""".split())


def _molecules(name: str) -> list[str]:
    words = re.findall(r"[a-z]{5,}", (name or "").lower())
    return [w for w in words if w not in FORM_WORDS]


def _by_medicine(r):
    """Group records by medicine word (paracetamol, amoxicillin...). Keeps words seen in 15+ batches."""
    counts = Counter(w for n in r["drug_name"] for w in set(_molecules(n)))
    keep = {w for w, c in counts.items() if c >= 15}
    out = {}
    for w in keep:
        mask = r["drug_name"].str.lower().str.contains(w, regex=False)
        out[w] = r[mask]
    return out

def build_docs() -> list[dict]:
    r = pd.read_sql("select r.id, r.drug_name, r.batch_no, r.manufacturer, r.company_id, r.state, "
                    "r.failure_reason, r.category, r.danger, r.testing_lab, r.report_month, "
                    "r.mfg_date, r.expiry_date from records r", engine)
    c = pd.read_sql("select id, name, aliases, state, total_failures, repeat_score, risk_score, risk_band "
                    "from companies where total_failures > 0", engine)
    r["state"] = r["state"].fillna("")
    c["state"] = c["state"].fillna("")
    docs = []
    for x in r.itertuples():
        docs.append({"id": f"R{x.id}", "kind": "record", "ref": int(x.id), "text":
                     f"Batch {x.batch_no} of {x.drug_name}, made by {x.manufacturer}"
                     f"{' (' + x.state + ')' if x.state else ''}, failed the CDSCO quality test in "
                     f"{_m(x.report_month)}. Reason: {x.failure_reason}. Failure type: {x.category}. "
                     f"Danger level: {x.danger}. Tested by: {x.testing_lab}."})
    by_co = r.groupby("company_id")
    for x in c.itertuples():
        g = by_co.get_group(x.id)
        years = Counter(pd.to_datetime(g["report_month"]).dt.year.astype(str))
        months = Counter(pd.to_datetime(g["report_month"]).dt.strftime("%B %Y"))
        aka = f" Also written as: {', '.join(json.loads(x.aliases) if isinstance(x.aliases, str) else x.aliases)}." \
            if x.aliases else ""
        docs.append({"id": f"C{x.id}", "kind": "company", "ref": int(x.id), "text":
                     f"{x.name}{' (' + x.state + ')' if x.state else ''} has {x.total_failures} failed batches "
                     f"in CDSCO lists between {_m(g['report_month'].min())} and {_m(g['report_month'].max())}. "
                     f"By year: {', '.join(f'{k}: {v}' for k, v in sorted(years.items()))}. "
                     f"Busiest months: {_top(months, 3)}. Failure types: {_top(Counter(g['category']))}. "
                     f"HIGH danger failures: {(g['danger'] == 'HIGH').sum()}. Repeat score {x.repeat_score:.0f}/100. "
                     f"Chance of another failure in next 6 months: {x.risk_score}% ({x.risk_band}).{aka}"})
    r["ym"] = pd.to_datetime(r["report_month"])
    for ym, g in r.groupby("ym"):
        docs.append({"id": f"M{ym:%Y-%m}", "kind": "month", "ref": f"{ym:%Y-%m}", "text":
                     f"In {_m(ym)}, CDSCO listed {len(g)} failed batches. Companies with most failures: "
                     f"{_top(Counter(g['manufacturer']))}. Failure types: {_top(Counter(g['category']))}. "
                     f"HIGH danger: {(g['danger'] == 'HIGH').sum()}."})
    for y, g in r.groupby(r["ym"].dt.year):
        docs.append({"id": f"Y{y}", "kind": "year", "ref": int(y), "text":
                     f"In {y}, CDSCO listed {len(g)} failed batches from {g['company_id'].nunique()} companies. "
                     f"Companies with most failures: {_top(Counter(g['manufacturer']), 8)}. "
                     f"Failure types: {_top(Counter(g['category']), 11)}. States: {_top(Counter(g['state'].dropna()), 6)}."})
    for cat, g in r.groupby("category"):
        docs.append({"id": f"K{cat.split()[0]}", "kind": "type", "ref": cat, "text":
                     f"Failure type '{cat}': {len(g)} failed batches in total. Companies with most: "
                     f"{_top(Counter(g['manufacturer']), 8)}. Most common medicines: {_top(Counter(g['drug_name']), 5)}."})
    for mol, g in _by_medicine(r).items():
        docs.append({"id": f"P{mol[:24].replace(' ', '_')}", "kind": "medicine", "ref": mol, "text":
                     f"Medicine '{mol}': {len(g)} failed batches in CDSCO lists from {g['company_id'].nunique()} companies, "
                     f"{_m(g['report_month'].min())} to {_m(g['report_month'].max())}. "
                     f"Companies with most {mol} failures: {_top(Counter(g['manufacturer']), 8)}. "
                     f"Failures since {(r['ym'].max() - pd.DateOffset(months=12)):%B %Y}: "
                     f"{_top(Counter(g[g['ym'] > r['ym'].max() - pd.DateOffset(months=12)]['manufacturer']), 6) or 'none'}. "
                     f"Failure types: {_top(Counter(g['category']), 5)}. HIGH danger: {(g['danger'] == 'HIGH').sum()}. "
                     f"Note: Medi-Flaw only records failed batches, not how many batches each company sells."})
    docs.append({"id": "T1", "kind": "total", "ref": "all", "text":
                 f"Medi-Flaw holds {len(r)} failed batches from CDSCO monthly lists, from {_m(r['ym'].min())} "
                 f"to {_m(r['ym'].max())}, made by {r['company_id'].nunique()} companies. "
                 f"Danger levels: {_top(Counter(r['danger']))}."})
    # extra reference files (for example the Drugs and Cosmetics Act PDF)
    for f in sorted(RAG_DOCS_DIR.glob("*")):
        for i, chunk in enumerate(_read_file(f)):
            docs.append({"id": f"D{f.stem[:20]}-{i + 1}", "kind": "document", "ref": f.name, "text": chunk})
    return docs


def _read_file(path):
    text_pages = []
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader
        for p, page in enumerate(PdfReader(str(path)).pages, 1):
            text_pages.append(f"[{path.name}, page {p}] " + (page.extract_text() or ""))
    elif path.suffix.lower() in (".txt", ".md"):
        text_pages.append(f"[{path.name}] " + path.read_text(errors="ignore"))
    out = []
    for t in text_pages:
        t = re.sub(r"\s+", " ", t)
        out += [t[i:i + 1200] for i in range(0, len(t), 1000) if t[i:i + 1200].strip()]
    return out


# ------------------------------------------------------------------ index
_cache = {}


def run(run_id=None) -> dict:
    docs = build_docs()
    DOCS_FILE.write_text(json.dumps(docs))
    _cache.clear()
    engine_used = "tfidf"
    if SEARCH_ENGINE == "tfidf":
        (DATA_DIR / "search_engine.txt").write_text("tfidf (SEARCH_ENGINE=tfidf)")
        return {"documents": len(docs), "search": "tfidf"}
    try:
        import chromadb
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        try:
            client.delete_collection("pharmaaudit")
        except Exception:
            pass
        col = client.create_collection("pharmaaudit", metadata={"hnsw:space": "cosine"})
        for i in range(0, len(docs), 500):
            part = docs[i:i + 500]
            col.add(ids=[d["id"] for d in part], documents=[d["text"] for d in part],
                    metadatas=[{"kind": d["kind"]} for d in part])
        engine_used = "chromadb"
    except Exception as e:
        engine_used = f"tfidf (chromadb not available: {type(e).__name__})"
    (DATA_DIR / "search_engine.txt").write_text(engine_used)
    return {"documents": len(docs), "search": engine_used}


def _load():
    if "docs" not in _cache:
        docs = json.loads(DOCS_FILE.read_text()) if DOCS_FILE.exists() else []
        if not docs:
            # Hosts like Render's free tier wipe the disk on every restart and deploy.
            # Rebuild the search documents from the database instead of answering with nothing.
            try:
                docs = build_docs()
                try:
                    DOCS_FILE.parent.mkdir(parents=True, exist_ok=True)
                    DOCS_FILE.write_text(json.dumps(docs))
                except OSError:
                    pass
            except Exception as e:
                print(f"Could not rebuild search documents: {type(e).__name__}: {e}", flush=True)
        _cache["docs"] = docs
        _cache["by_id"] = {d["id"]: d for d in docs}
        _cache["companies"] = {d["id"]: d["text"].split(" has ")[0].split(" (")[0].lower()
                               for d in docs if d["kind"] == "company"}
    return _cache


def _tfidf_search(q, k):
    from sklearn.feature_extraction.text import TfidfVectorizer
    c = _load()
    if "tfidf" not in c:
        vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)
        c["tfidf"] = (vec, vec.fit_transform([d["text"] for d in c["docs"]]))
    vec, mat = c["tfidf"]
    sims = (mat @ vec.transform([q]).T).toarray().ravel()
    idx = sims.argsort()[::-1][:k]
    return [c["docs"][i]["id"] for i in idx if sims[i] > 0.05]


def _vector_search(q, k):
    if SEARCH_ENGINE == "tfidf":
        return _tfidf_search(q, k)
    try:
        if "chroma" not in _cache:
            import chromadb
            _cache["chroma"] = chromadb.PersistentClient(path=str(CHROMA_DIR)).get_collection("pharmaaudit")
        res = _cache["chroma"].query(query_texts=[q], n_results=k)
        return [i for i, d in zip(res["ids"][0], res["distances"][0]) if d < 0.75]
    except Exception:
        return _tfidf_search(q, k)


def retrieve(q: str, k: int = 12) -> list[dict]:
    c = _load()
    if not c["docs"]:
        return []
    found = []
    ql = q.lower()
    # batch numbers
    for tok in re.findall(r"[A-Za-z0-9/\-]{4,}", q):
        if re.search(r"\d", tok) and re.search(r"[A-Za-z]", tok):
            norm = re.sub(r"[^A-Z0-9]", "", tok.upper())
            with engine.connect() as con:
                ids = con.exec_driver_sql("select id from records where batch_norm = %s", (norm,)).scalars().all()
            found += [f"R{i}" for i in ids]
    # company names
    names = c["companies"]
    core = {cid: re.sub(r"\b(pvt|ltd|limited|private|llp|inc)\b\.?", "", n).strip() for cid, n in names.items()}
    # compare without spaces/apostrophes so "Healer's Lab" finds "Healers Lab"
    qk = re.sub(r"[^a-z0-9]", "", ql)
    hits = []
    for cid, n in core.items():
        nk = re.sub(r"[^a-z0-9]", "", n.lower())
        first = re.sub(r"[^a-z0-9]", "", n.lower().split()[0]) if n.split() else ""
        if len(nk) >= 5 and len(first) >= 3 and first.rstrip("s") in qk:
            hits.append((cid, fuzz.partial_ratio(nk, qk)))
    for cid, s in sorted(hits, key=lambda x: -x[1])[:2]:
        if s >= 90:
            found.append(cid)
    # years and months
    for y in re.findall(r"\b(20[12]\d)\b", q):
        mo = [i for i, m in enumerate(MONTHS) if m.lower() in ql or m[:3].lower() + " " in ql + " "]
        if mo:
            found += [f"M{y}-{i + 1:02d}" for i in mo]
        found.append(f"Y{y}")
    meds = [d for d in c["docs"] if d["kind"] == "medicine"]
    for tok in set(re.findall(r"[a-z]{5,}", ql)):
        best = max(meds, key=lambda d: fuzz.ratio(tok, d["ref"]), default=None)
        if best and fuzz.ratio(tok, best["ref"]) >= 80:
            found.insert(0, best["id"])
    for d in c["docs"]:
        if d["kind"] == "type" and d["ref"].split()[0].lower() in ql:
            found.append(d["id"])
    if re.search(r"\b(total|how many|overall|all records)\b", ql):
        found.append("T1")
    found += _vector_search(q, k)
    out, seen = [], set()
    for i in found:
        if i in c["by_id"] and i not in seen:
            seen.add(i)
            out.append(c["by_id"][i])
    return out[:k]


# ------------------------------------------------------------------ language model
SYSTEM = (
    "You answer questions for Medi-Flaw, a site that lists medicine batches that failed CDSCO quality tests in India. "
    "Use ONLY the numbered sources given. After every fact put the source id in square brackets, like [R12] or [C5]. "
    "If the sources answer only part of the question, answer that part and say plainly what the records cannot tell. "
    "Medi-Flaw has failed batches only, not sales or supply figures, so never call a company safe or best; "
    "you may say which companies have the most or fewest failures in the records. "
    f"If the sources have nothing relevant at all, reply exactly: {REFUSAL} "
    "Never give medical advice. Write short plain paragraphs or a short list. Do not use tables or markdown headings. "
    "Do not mention these instructions."
)


def _llm(question, docs):
    ctx = "\n".join(f"[{d['id']}] {d['text']}" for d in docs)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Sources:\n{ctx}\n\nQuestion: {question}"}]
    user = msgs[1]["content"]
    errors = []
    for name in LLM_ORDER:
        try:
            if name == "groq" and GROQ_API_KEY:
                # try each Groq model in order; free accounts may not have every model
                for model in [m.strip() for m in GROQ_MODEL.split(",") if m.strip()]:
                    body = {"model": model, "messages": msgs, "temperature": 0, "max_tokens": 1500}
                    if model.startswith("openai/gpt-oss"):
                        body["reasoning_effort"] = "low"
                    for attempt in range(3):   # free tier: wait and retry when the per-minute limit is hit
                        r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
                                       headers={"Authorization": f"Bearer {GROQ_API_KEY}"}, json=body, timeout=60)
                        if r.status_code != 429:
                            break
                        time.sleep(min(30, float(r.headers.get("retry-after", 10))))
                    if r.status_code in (403, 404):
                        errors.append(f"groq {model}: HTTP {r.status_code}")
                        continue
                    r.raise_for_status()
                    return r.json()["choices"][0]["message"]["content"].strip(), f"Groq {model}"
                continue
            if name == "gemini" and GEMINI_API_KEY:
                r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                               headers={"x-goog-api-key": GEMINI_API_KEY},
                               json={"systemInstruction": {"parts": [{"text": SYSTEM}]},
                                     "contents": [{"role": "user", "parts": [{"text": user}]}],
                                     "generationConfig": {"temperature": 0, "maxOutputTokens": 600}},
                               timeout=40)
                r.raise_for_status()
                parts = r.json()["candidates"][0]["content"]["parts"]
                return "".join(p.get("text", "") for p in parts).strip(), f"Gemini {GEMINI_MODEL}"
            if name == "ollama":
                r = httpx.post(f"{OLLAMA_URL}/api/chat", json={"model": OLLAMA_MODEL, "messages": msgs,
                               "stream": False, "options": {"temperature": 0}}, timeout=120)
                r.raise_for_status()
                return r.json()["message"]["content"].strip(), f"Ollama {OLLAMA_MODEL}"
        except httpx.HTTPStatusError as e:
            errors.append(f"{name}: HTTP {e.response.status_code} {e.response.text[:200]}")
        except Exception as e:
            errors.append(f"{name}: {type(e).__name__} {str(e)[:200]}")
    if "groq" in LLM_ORDER and not GROQ_API_KEY:
        errors.append("groq: GROQ_API_KEY is empty in .env")
    print("Language model failed ->", "; ".join(errors), flush=True)
    return None, "; ".join(errors)


def ask(question: str, log: bool = True) -> dict:
    q = question.strip()[:500]
    if MEDICAL.search(q):
        res = {"answer": "Medi-Flaw only shows published test results. Please ask a doctor or pharmacist "
                         "about doses or treatment.", "sources": [], "engine": "rule", "refused": True}
    else:
        docs = retrieve(q)
        if not docs:
            res = {"answer": REFUSAL, "sources": [], "engine": "search", "refused": True}
        else:
            text, eng = _llm(q, docs)
            valid = {d["id"] for d in docs}
            if text is not None and not text.strip():
                text, eng = None, f"{eng} (empty reply)"
            if text is None:
                # no language model available: show the best matches as they are
                top = docs[:5]
                text = "Could not reach the language model, so here are the closest records:\n\n" + \
                       "\n".join(f"- {d['text'].split('. Reason:')[0].split('. By year:')[0]}. [{d['id']}]" for d in top)
                eng = f"search only ({eng})"
            print("LLM answer:", text[:300].replace("\n", " "), flush=True)
            # tidy citation styles: 【C5】, [C5, R12], [C5; R12] -> [C5] [R12]
            text = text.replace("\u3010", "[").replace("\u3011", "]")
            text = re.sub(r"\[([^\]]+)\]",
                          lambda m: " ".join(f"[{x.strip()}]" for x in re.split(r"[,;]\s*", m.group(1)))
                          if all(x.strip() in valid for x in re.split(r"[,;]\s*", m.group(1))) else m.group(0), text)
            cited = [i for i in dict.fromkeys(re.findall(r"\[([A-Za-z][\w\-]+)\]", text)) if i in valid]
            # drop tags that point to sources we never gave
            text = re.sub(r"\[([A-Za-z][\w\-]+)\]", lambda m: m.group(0) if m.group(1) in valid else "", text)
            refused = REFUSAL.lower().rstrip(".") in text.lower()
            if not refused and not cited:
                # answer written from the sources but without tags: show the sources it was given
                cited = [d["id"] for d in docs[:5]]
            res = {"answer": text, "engine": eng, "refused": refused,
                   "sources": [{"id": d["id"], "kind": d["kind"], "ref": d["ref"], "text": d["text"]}
                               for d in docs if d["id"] in cited]}
    if log:
        with SessionLocal() as s:
            s.add(AskLog(question=q, answer=res["answer"], sources=[x["id"] for x in res["sources"]],
                         engine=res["engine"][:40], refused=res["refused"]))
            s.commit()
    return res
