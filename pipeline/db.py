"""Database tables (PostgreSQL via SQLAlchemy)."""
from datetime import datetime, date, timezone


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

from sqlalchemy import (create_engine, String, Integer, Float, Boolean, Date, DateTime, Text,
                        ForeignKey, JSON, UniqueConstraint, Index)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class RawRecord(Base):
    """Exactly what CDSCO published. Never edited."""
    __tablename__ = "raw_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    row_hash: Mapped[str] = mapped_column(String(64), unique=True)
    source_month: Mapped[str] = mapped_column(String(16), index=True)
    drug_name: Mapped[str | None] = mapped_column(Text)
    batch_no: Mapped[str | None] = mapped_column(String(120))
    mfg_date: Mapped[str | None] = mapped_column(String(40))
    expiry_date: Mapped[str | None] = mapped_column(String(40))
    manufacturer_raw: Mapped[str | None] = mapped_column(Text)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    reporting_source: Mapped[str | None] = mapped_column(String(120))
    testing_lab: Mapped[str | None] = mapped_column(String(200))
    reporting_month: Mapped[str | None] = mapped_column(String(16))
    origin: Mapped[str] = mapped_column(String(40), default="seed")  # seed / portal / file
    run_id: Mapped[int | None] = mapped_column(Integer)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300), unique=True)
    name_key: Mapped[str] = mapped_column(String(300), index=True)
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    state: Mapped[str | None] = mapped_column(String(60))
    total_failures: Mapped[int] = mapped_column(Integer, default=0)
    first_month: Mapped[date | None] = mapped_column(Date)
    last_month: Mapped[date | None] = mapped_column(Date)
    repeat_score: Mapped[float] = mapped_column(Float, default=0)
    risk_prob: Mapped[float | None] = mapped_column(Float)
    risk_score: Mapped[int | None] = mapped_column(Integer)
    risk_band: Mapped[str | None] = mapped_column(String(10))
    risk_reasons: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Record(Base):
    """Cleaned failed batch."""
    __tablename__ = "records"
    id: Mapped[int] = mapped_column(primary_key=True)
    raw_id: Mapped[int] = mapped_column(ForeignKey("raw_records.id"), unique=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), index=True)
    drug_name: Mapped[str] = mapped_column(Text)
    batch_no: Mapped[str] = mapped_column(String(120))
    batch_norm: Mapped[str] = mapped_column(String(120), index=True)
    mfg_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    manufacturer: Mapped[str] = mapped_column(String(300))
    state: Mapped[str | None] = mapped_column(String(60), index=True)
    failure_reason: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), index=True)
    danger: Mapped[str] = mapped_column(String(10), index=True)
    danger_note: Mapped[str] = mapped_column(Text)
    reporting_source: Mapped[str | None] = mapped_column(String(40))
    testing_lab: Mapped[str | None] = mapped_column(String(200))
    report_month: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CleaningLog(Base):
    __tablename__ = "cleaning_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    raw_id: Mapped[int] = mapped_column(Integer, index=True)
    field: Mapped[str] = mapped_column(String(40), index=True)
    before: Mapped[str | None] = mapped_column(Text)
    after: Mapped[str | None] = mapped_column(Text)
    rule: Mapped[str] = mapped_column(Text)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    organisation: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="pharmacist")  # pharmacist / admin
    account_type: Mapped[str | None] = mapped_column(String(20), default="business")  # business / personal
    auth_provider: Mapped[str | None] = mapped_column(String(20), default="password")  # password / google
    extra_emails: Mapped[list | None] = mapped_column(JSON, default=list)  # staff who also get alerts (business)
    avatar: Mapped[str | None] = mapped_column(String(20))  # one of the 10 preset avatars (a1..a10)
    password_hash: Mapped[str] = mapped_column(String(200))
    email_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EmailCode(Base):
    """A 6-digit code emailed at sign-up. The account is only created once the code is entered."""
    __tablename__ = "email_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)  # name, organisation, account_type, password_hash
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WatchItem(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("user_id", "batch_norm"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    batch_no: Mapped[str] = mapped_column(String(120))
    batch_norm: Mapped[str] = mapped_column(String(120), index=True)
    drug_name: Mapped[str | None] = mapped_column(String(300))
    manufacturer: Mapped[str | None] = mapped_column(String(300))
    quantity: Mapped[int | None] = mapped_column(Integer)
    purchased_on: Mapped[date | None] = mapped_column(Date)
    supplier: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(20), default="manual")   # manual / csv / pdf / photo / demo
    status: Mapped[str] = mapped_column(String(20), default="in_stock")  # in_stock / returned
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    taken_by: Mapped[str | None] = mapped_column(String(80))  # personal: who takes it (Amma, Appa...)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (UniqueConstraint("watch_id", "record_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    watch_id: Mapped[int] = mapped_column(ForeignKey("watchlist.id", ondelete="CASCADE"))
    record_id: Mapped[int] = mapped_column(ForeignKey("records.id"))
    run_id: Mapped[int | None] = mapped_column(Integer)
    to_email: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    delivery: Mapped[str] = mapped_column(String(20))  # sent / outbox / failed
    token: Mapped[str] = mapped_column(String(64), unique=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime)
    followup_at: Mapped[datetime | None] = mapped_column(DateTime)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    trigger: Mapped[str] = mapped_column(String(20))  # n8n / manual / schedule / setup
    status: Mapped[str] = mapped_column(String(20), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    steps: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)


class Spike(Base):
    __tablename__ = "spikes"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    month: Mapped[date] = mapped_column(Date)
    failures: Mapped[int] = mapped_column(Integer)
    usual: Mapped[float] = mapped_column(Float)
    score: Mapped[float] = mapped_column(Float)


class ModelReport(Base):
    __tablename__ = "model_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), index=True)
    report: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AskLog(Base):
    __tablename__ = "ask_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    engine: Mapped[str] = mapped_column(String(40))
    refused: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def init_db():
    Base.metadata.create_all(engine)
    # add columns introduced after the first version (safe to run every time)
    from sqlalchemy import text
    with engine.begin() as con:
        for sql in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts boolean DEFAULT true",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type varchar(20) DEFAULT 'business'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(20) DEFAULT 'password'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_emails json",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar varchar(20)",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS taken_by varchar(80)",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS manufacturer varchar(300)",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS quantity integer",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS purchased_on date",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS supplier varchar(200)",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'manual'",
            "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'in_stock'",
        ]:
            con.execute(text(sql))
