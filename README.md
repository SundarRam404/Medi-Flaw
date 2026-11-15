# Medi-Flaw

Searchable record of medicine batches that failed CDSCO quality tests (Not of Standard Quality),
with company risk scores, question answering over the records, watchlist email alerts,
and a monthly update run by n8n.

## What is in this folder

| Folder | What it does |
|---|---|
| `pipeline/fetch.py` | Gets raw records from the CDSCO portal (backup: CSV files in `data/incoming/`) |
| `pipeline/clean.py` | Cleans company names, failure reasons, dates, labs, state. Logs every change |
| `pipeline/danger.py` | Danger level per batch (HIGH / MEDIUM / LOW) from the failure type |
| `pipeline/model.py` | Repeat score, XGBoost risk model with SHAP reasons, Isolation Forest for unusual months |
| `pipeline/rag.py` | Search index (ChromaDB) + Groq Llama 3.3 70B answers (Ollama as local backup) with sources, refuses without proof |
| `pipeline/alerts.py` | Matches new failures to watchlists, sends emails and reminders |
| `pipeline/run.py` | Runs the steps and records each run |
| `backend/main.py` | FastAPI: all APIs, login (JWT), endpoints n8n calls |
| `frontend/` | Next.js website |
| `n8n/medi-flaw_monthly.json` | n8n workflow, import into n8n |
| `eval/ai_eval.py` | 50-question test of the Ask feature |
| `data/cdsco_seed.csv` | 6,338 CDSCO rows collected in Phase 1 (Jan 2019 to Jul 2026) |

## One-time setup (Mac)

Needs Python 3.10+ and Node.js 20+.

```bash
cd ~/Desktop/"Mini project"/Medi-Flaw

# 1. Python packages (inside a virtual environment)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
brew install libomp          # needed by XGBoost on Mac (skip if you have no Homebrew and xgboost imports fine)

# 2. Settings
cp .env.example .env
#    open .env and paste: DATABASE_URL (Neon) and GROQ_API_KEY

# 3. Load data, train models, build search index (about 1-3 minutes)
python3 -m pipeline.run --setup

# 4. Website packages
cd frontend && npm install && cd ..
```

## Run it (3 terminal tabs)

```bash
# Tab 1 - backend  (API docs at http://localhost:8000/docs)
source .venv/bin/activate
uvicorn backend.main:app --port 8000

# Tab 2 - website  (http://localhost:3000)
cd frontend && npm run dev

# Tab 3 - n8n  (http://localhost:5678)
npx n8n
```

### n8n, first time
1. Open http://localhost:5678 and create the owner account.
2. Workflows > Import from file > `n8n/medi-flaw_monthly.json`.
3. Check the **Settings** node: `api` = `http://localhost:8000`, `key` = same as `PIPELINE_KEY` in `.env`.
4. Click **Active** (top right). It now runs on the 1st of every month at 6 AM, and the website's
   **Run now** button triggers it through the webhook.

## Configuration and logins

No passwords or keys live in this repository. Everything is read from environment variables
(`.env` locally, the host's settings in production). The app refuses to start if a required
value is missing or too short, so it can never go live on a placeholder.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SECRET_KEY` | yes | 32+ characters, signs login tokens |
| `PIPELINE_KEY` | yes | 32+ characters, protects the pipeline endpoints n8n calls |
| `ADMIN_EMAIL` | yes | admin login |
| `ADMIN_PASSWORD` | yes | 12+ characters. Change it and restart to rotate. |
| `GROQ_API_KEY` | for AI answers | |
| `SMTP_USER`, `SMTP_PASSWORD` | for email alerts | Gmail app password, not the account password |
| `SEED_DEMO` | no | `1` creates a demo pharmacy for presentations. Keep `0` in production. |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | only if `SEED_DEMO=1` | |

The n8n workflow files contain `PASTE_PIPELINE_KEY_HERE`. After importing them into n8n,
replace it with your real `PIPELINE_KEY`.

## Demo order (for the evaluation)

1. **Home**: search `SHT7550` -> failed batch, danger level, company risk, return letter.
2. **Data**: before / after cleaning, raw vs cleaned vs every change.
3. **Companies / Reports**: risk ranking, SHAP reasons, Isolation Forest unusual months.
4. **Ask**: "How many failed batches were listed in 2025?" -> answer with sources.
   "Who won IPL 2025?" -> refused.
5. **Watchlist** (demo login): 4 batches, none failed yet (July 2026 is held back for the demo).
6. **Admin** (admin login) > **Run now** -> n8n runs fetch, clean, score, index, alerts.
   Watchlist now shows 2 failed batches and the alert emails.
7. **Admin > Model results**: model vs simple rule, 50-question test.

To show the demo again: `python3 -m pipeline.run --reset-demo`

## Other commands

```bash
python3 -m pipeline.run --monthly        # one full monthly run without n8n
python3 -m pipeline.run --step fetch     # one step only
python3 -m eval.ai_eval                  # 50-question test (needs GROQ_API_KEY)
```

Reference PDFs (for example the Drugs and Cosmetics Act) can be dropped into `data/rag_docs/`.
They are added to the search index on the next run, and answers can cite their page numbers.

## Results on current data

- 6,338 rows as published -> 6,303 after removing duplicates; 5,401 company spellings -> 1,761 companies;
  3,307 different failure texts -> 11 failure types.
- Risk model (will the company fail again in the next 6 months, tested on 2024-2026 only):
  F1 0.47-0.49 vs 0.44 for the simple rule "failed in the last 6 months"; ROC AUC about 0.72.
- 86% of failed batches come from companies that failed more than once.
