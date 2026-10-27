"""Step 3 - company scores.

1. Repeat score (0-100): plain formula from history.
2. Risk model: XGBoost predicts "will this company have another failed batch
   in the next 6 months?". Trained only on the past, tested on later months.
3. SHAP gives the top reasons behind each company's risk.
4. Isolation Forest flags months where a company failed far more than usual.
"""
import json
from datetime import date, datetime
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sqlalchemy import select, delete, update
from xgboost import XGBClassifier, DMatrix
from .db import utcnow, SessionLocal, engine, Company, Spike, ModelReport
from .config import MODEL_DIR

HORIZON = 6  # months ahead
FEATURES = {
    "n_total": "Total failed batches so far",
    "n_3m": "Failed batches in last 3 months",
    "n_6m": "Failed batches in last 6 months",
    "n_12m": "Failed batches in last 12 months",
    "n_24m": "Failed batches in last 24 months",
    "months_since_last": "Months since last failure",
    "months_active": "Months since first failure",
    "n_categories": "Different failure types",
    "same_defect_max": "Most repeats of one failure type",
    "high_share": "Share of HIGH danger failures",
    "n_high_12m": "HIGH danger failures in last 12 months",
    "n_drugs": "Different medicines failed",
    "n_labs": "Different labs that caught it",
    "max_one_month": "Most failures in a single month",
    "trend": "Last 6 months compared with the 6 before",
}


def mnum(d) -> int:
    d = pd.Timestamp(d)
    return d.year * 12 + d.month - 1


def load_records() -> pd.DataFrame:
    df = pd.read_sql("select id, company_id, drug_name, category, danger, testing_lab, report_month "
                     "from records where company_id is not null", engine)
    df["m"] = df["report_month"].apply(mnum)
    df["high"] = (df["danger"] == "HIGH").astype(int)
    return df


def features_at(df: pd.DataFrame, t: int) -> pd.DataFrame:
    """Features for every company using only records before month t."""
    past = df[df["m"] < t]
    if past.empty:
        return pd.DataFrame()
    g = past.groupby("company_id")
    f = pd.DataFrame({
        "n_total": g.size(),
        "months_since_last": t - g["m"].max(),
        "months_active": t - g["m"].min(),
        "n_categories": g["category"].nunique(),
        "high_share": g["high"].mean(),
        "n_drugs": g["drug_name"].nunique(),
        "n_labs": g["testing_lab"].nunique(),
    })
    for k in (3, 6, 12, 24):
        f[f"n_{k}m"] = past[past["m"] >= t - k].groupby("company_id").size()
    f["n_high_12m"] = past[(past["m"] >= t - 12) & (past["high"] == 1)].groupby("company_id").size()
    f["same_defect_max"] = past.groupby(["company_id", "category"]).size().groupby("company_id").max()
    f["max_one_month"] = past.groupby(["company_id", "m"]).size().groupby("company_id").max()
    f = f.fillna(0)
    prev6 = past[(past["m"] >= t - 12) & (past["m"] < t - 6)].groupby("company_id").size()
    f["trend"] = f["n_6m"] - prev6.reindex(f.index).fillna(0)
    return f[list(FEATURES)]


def label_at(df, t, ids):
    fut = df[(df["m"] >= t) & (df["m"] < t + HORIZON)]
    return pd.Series(ids, index=ids).isin(set(fut["company_id"])).astype(int)


def metrics(y, p, prob=None):
    out = {"precision": round(precision_score(y, p, zero_division=0), 3),
           "recall": round(recall_score(y, p, zero_division=0), 3),
           "f1": round(f1_score(y, p, zero_division=0), 3)}
    if prob is not None and len(set(y)) > 1:
        out["roc_auc"] = round(roc_auc_score(y, prob), 3)
    return out


def repeat_score(f: pd.DataFrame) -> pd.Series:
    freq = np.minimum(1, np.log1p(f["n_total"]) / np.log1p(20))
    recent = np.exp(-f["months_since_last"] / 12)
    same = np.minimum(1, (f["same_defect_max"] - 1) / 5)
    return (100 * (0.35 * freq + 0.25 * recent + 0.25 * same + 0.15 * f["high_share"])).round(1)


def plain_reason(feat: str, value: float, push: float) -> str:
    v = int(value) if float(value).is_integer() else round(float(value), 2)
    if feat == "high_share":
        v = f"{round(float(value) * 100)}%"
    word = "raises" if push > 0 else "lowers"
    return f"{FEATURES[feat]}: {v} ({word} risk)"


def run(run_id=None) -> dict:
    df = load_records()
    if df.empty:
        return {"error": "no records"}
    last = int(df["m"].max())
    first = int(df["m"].min())

    # ---------- build training rows: one row per company per quarter
    rows = []
    for t in range(first + 12, last + 1 - HORIZON + 1, 3):
        f = features_at(df, t)
        if f.empty:
            continue
        f["y"] = label_at(df, t, f.index.tolist()).values
        f["t"] = t
        rows.append(f)
    data = pd.concat(rows)
    split = last + 1 - HORIZON - 24          # last 2 years of cut-offs = test
    train, test = data[data["t"] < split], data[data["t"] >= split]
    X_cols = list(FEATURES)
    pos = max(1, train["y"].sum())
    params = dict(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
                  colsample_bytree=0.8, eval_metric="logloss",
                  scale_pos_weight=(len(train) - pos) / pos, random_state=42)
    m = XGBClassifier(**params)
    m.fit(train[X_cols], train["y"])
    prob = m.predict_proba(test[X_cols])[:, 1]
    pred = (prob >= 0.5).astype(int)
    base = (test["n_6m"] > 0).astype(int)       # simple rule to beat

    # precision among top 50 riskiest companies at each test cut-off
    test = test.assign(prob=prob)
    p50 = test.groupby("t").apply(lambda g: g.nlargest(50, "prob")["y"].mean(), include_groups=False).mean()
    b50 = test.groupby("t").apply(lambda g: g.nlargest(50, "n_6m")["y"].mean(), include_groups=False).mean()

    def ym(x):
        return f"{x // 12}-{x % 12 + 1:02d}"

    report = {
        "question": f"Will the company have another failed batch in the next {HORIZON} months?",
        "train_rows": int(len(train)), "test_rows": int(len(test)),
        "train_period": f"cut-offs {ym(int(train['t'].min()))} to {ym(int(train['t'].max()))}",
        "test_period": f"cut-offs {ym(int(test['t'].min()))} to {ym(int(test['t'].max()))}",
        "positive_rate_test": round(float(test["y"].mean()), 3),
        "model": metrics(test["y"], pred, prob),
        "baseline": metrics(test["y"], base),
        "baseline_rule": "Predict 'yes' if the company failed in the last 6 months",
        "precision_top50": {"model": round(float(p50), 3), "baseline": round(float(b50), 3)},
        "importance": sorted(
            [{"feature": FEATURES[c], "value": round(float(v), 4)} for c, v in zip(X_cols, m.feature_importances_)],
            key=lambda x: -x["value"]),
        "trained_at": utcnow().isoformat(timespec="seconds"),
    }

    # ---------- final model on all rows, score every company today
    final = XGBClassifier(**params)
    final.fit(data[X_cols], data["y"])
    MODEL_DIR.mkdir(exist_ok=True)
    final.save_model(str(MODEL_DIR / "risk_model.json"))
    now = features_at(df, last + 1)
    p_now = final.predict_proba(now[X_cols])[:, 1]
    # SHAP values from XGBoost itself (same TreeSHAP method, no extra library);
    # last column is the base value, so it is dropped
    sv = final.get_booster().predict(DMatrix(now[X_cols]), pred_contribs=True)[:, :-1]
    rep = repeat_score(now)

    stats = df.groupby("company_id").agg(n=("id", "size"), first=("report_month", "min"), last=("report_month", "max"))
    states = pd.read_sql("select company_id, state from records where state is not null", engine) \
        .groupby("company_id")["state"].agg(lambda s: s.mode().iat[0])

    updates = []
    now_ids = set(now.index)
    with SessionLocal() as s:
        for cid in s.scalars(select(Company.id)).all():
            if cid not in now_ids:
                updates.append({"id": cid, "total_failures": 0})
                continue
            i = now.index.get_loc(cid)
            p = float(p_now[i])
            top = np.argsort(-np.abs(sv[i]))[:4]
            updates.append({
                "id": cid, "total_failures": int(stats.at[cid, "n"]),
                "first_month": stats.at[cid, "first"], "last_month": stats.at[cid, "last"],
                "state": states.get(cid), "repeat_score": float(rep.iloc[i]),
                "risk_prob": round(p, 4), "risk_score": int(round(p * 100)),
                "risk_band": "High" if p >= 0.6 else "Medium" if p >= 0.3 else "Low",
                "risk_reasons": [plain_reason(X_cols[j], now.iloc[i, j], sv[i][j]) for j in top],
                "updated_at": utcnow()})
        # same set of columns in every row so it goes as one batch
        full = [u for u in updates if len(u) > 2]
        empty = [u for u in updates if len(u) == 2]
        for u in full:
            if u["state"] is None:
                u.pop("state")
        with_state = [u for u in full if "state" in u]
        without_state = [u for u in full if "state" not in u]
        for group in (with_state, without_state, empty):
            if group:
                s.execute(update(Company), group)
        s.add(ModelReport(name="risk_model", report=report))
        s.commit()

    spikes = find_spikes(df)
    return {"companies_scored": int(len(now)), "test_f1": report["model"]["f1"],
            "baseline_f1": report["baseline"]["f1"], "spikes": spikes}


def find_spikes(df: pd.DataFrame) -> int:
    cm = df.groupby(["company_id", "m"]).agg(n=("id", "size")).reset_index().sort_values(["company_id", "m"])
    cm["same"] = df.groupby(["company_id", "m", "category"]).size().groupby(["company_id", "m"]).max().values
    cm["usual"] = cm.groupby("company_id")["n"].transform(lambda x: x.shift().expanding().mean()).fillna(0)
    X = cm[["n", "same", "usual"]]
    iso = IsolationForest(n_estimators=200, contamination=0.01, random_state=42).fit(X)
    cm["score"] = -iso.score_samples(X)
    cm["flag"] = (iso.predict(X) == -1) & (cm["n"] >= 3) & (cm["n"] > cm["usual"] * 2)
    flagged = cm[cm["flag"]]
    with SessionLocal() as s:
        s.execute(delete(Spike))
        for r in flagged.itertuples():
            s.add(Spike(company_id=int(r.company_id), month=date(int(r.m) // 12, int(r.m) % 12 + 1, 1),
                        failures=int(r.n), usual=round(float(r.usual), 2), score=round(float(r.score), 3)))
        s.commit()
    return int(len(flagged))
