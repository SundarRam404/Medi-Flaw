"""50-question test for the question-answering feature.

  python3 -m eval.ai_eval

40 questions have a known answer taken straight from the database.
10 questions are outside our data and must be refused.
Results go to eval/results.json and are shown on the Admin page.
"""
import json, random, re, time
from collections import Counter
from pathlib import Path
import pandas as pd
from pipeline.db import engine, SessionLocal, ModelReport
from pipeline.rag import ask, REFUSAL

random.seed(7)
OUT = Path(__file__).parent / "results.json"

OUTSIDE = [
    "Who won the IPL in 2025?",
    "What is the price of Dolo 650?",
    "Tell me about batch ZZQ99999X",
    "Is Crocin safe during pregnancy?",
    "How many failed batches did Acme Imaginary Pharma Ltd have?",
    "What is the capital of Japan?",
    "Which hospital in Chennai is the best?",
    "What did the FDA recall in 2024?",
    "Write a poem about medicines.",
    "What dose of amoxicillin should a child take?",
]


def build():
    r = pd.read_sql("select r.batch_no, r.manufacturer, r.category, r.report_month, r.drug_name "
                    "from records r", engine)
    r["year"] = pd.to_datetime(r["report_month"]).dt.year
    qs = []
    # company totals in a year
    cy = r.groupby(["manufacturer", "year"]).size().reset_index(name="n")
    for x in cy[cy["n"] >= 3].sample(15, random_state=1).itertuples():
        qs.append({"type": "company-year", "q": f"How many failed batches did {x.manufacturer} have in {x.year}?",
                   "expect": [str(x.n)]})
    # batch lookups
    for x in r.sample(15, random_state=2).itertuples():
        qs.append({"type": "batch", "q": f"Which company made batch {x.batch_no} and why did it fail?",
                   "expect": [x.manufacturer.split()[0]]})
    # year totals
    yt = r.groupby("year").size()
    for y, n in yt.items():
        qs.append({"type": "year", "q": f"How many failed batches were listed in {y}?", "expect": [str(n)]})
    # most common failure type of a company
    top = r.groupby("manufacturer").filter(lambda g: len(g) >= 8).groupby("manufacturer")["category"] \
        .agg(lambda s: Counter(s).most_common(1)[0][0])
    for name, cat in list(top.sample(min(10 - 0, len(top)), random_state=3).items())[: 40 - len(qs)]:
        qs.append({"type": "company-type", "q": f"What is the most common failure type for {name}?",
                   "expect": [cat.split()[0]]})
    qs = qs[:40]
    qs += [{"type": "outside", "q": q, "expect": None} for q in OUTSIDE]
    return qs


def main():
    qs = build()
    rows, correct, refused_ok, wrong, hallucinated = [], 0, 0, 0, 0
    for i, item in enumerate(qs, 1):
        res = ask(item["q"], log=False)
        time.sleep(8)   # Groq free tier: 12k tokens per minute
        a = res["answer"]
        if item["expect"] is None:
            ok = res["refused"]
            refused_ok += ok
            hallucinated += not ok
        else:
            ok = (not res["refused"]) and all(re.search(rf"\b{re.escape(e)}\b", a, re.I) for e in item["expect"])
            correct += ok
            wrong += not ok
        rows.append({**item, "answer": a, "refused": res["refused"], "engine": res["engine"], "pass": bool(ok)})
        print(f"{i:2d} {'PASS' if ok else 'FAIL'}  {item['q'][:70]}")
    summary = {
        "questions": len(qs),
        "answerable": 40, "answered_correctly": correct,
        "outside_data": 10, "refused_correctly": refused_ok,
        "accuracy": round(correct / 40, 3),
        "refusal_rate_outside": round(refused_ok / 10, 3),
        "made_up_answers": hallucinated,
        "engine": rows[0]["engine"] if rows else "",
    }
    OUT.write_text(json.dumps({"summary": summary, "rows": rows}, indent=1))
    with SessionLocal() as s:
        s.add(ModelReport(name="ai_eval", report={"summary": summary, "rows": rows}))
        s.commit()
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
