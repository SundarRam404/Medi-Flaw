"""Settings. Everything comes from the .env file in the project root."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pharmaaudit")
# Neon gives "postgres://" links sometimes; SQLAlchemy wants "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret")
PIPELINE_KEY = os.getenv("PIPELINE_KEY", "pharmaaudit-pipeline-key")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@pharmaaudit.in")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@pharmaaudit.in")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo123")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile,openai/gpt-oss-120b")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
# order to try language models in; the first one that answers is used
LLM_ORDER = [x.strip() for x in os.getenv("LLM_ORDER", "groq,ollama").split(",") if x.strip()]
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", SMTP_USER or "alerts@pharmaaudit.in")
FOLLOWUP_DAYS = int(os.getenv("FOLLOWUP_DAYS", "3"))

N8N_WEBHOOK_URL = os.getenv("RUN_NOW_WEBHOOK_URL", "")

DATA_DIR = ROOT / "data"
INCOMING_DIR = DATA_DIR / "incoming"
RAG_DOCS_DIR = DATA_DIR / "rag_docs"
CHROMA_DIR = DATA_DIR / "chroma"
MODEL_DIR = ROOT / "models"
SEED_CSV = DATA_DIR / "cdsco_seed.csv"
