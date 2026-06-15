"""
Central configuration read from environment (.env). Local-friendly defaults so the
app runs on SQLite + dev auth out of the box; flip these env vars at deploy time to
point at Supabase Postgres + Supabase Auth without touching app code.
"""

import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to backend/jobpls.db so the SQLite file is the SAME regardless of
# the process working directory (a relative ./jobpls.db split into two DBs when the
# launch CWD drifted). Override with the DATABASE_URL env var for Postgres at deploy.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_SQLITE = "sqlite:///" + os.path.join(_BACKEND_DIR, "jobpls.db").replace("\\", "/")


class Settings(BaseSettings):
    # Absolute env_file path too, for the same CWD-independence reason as the DB.
    model_config = SettingsConfigDict(env_file=os.path.join(_BACKEND_DIR, ".env"), extra="ignore")

    # --- Database ---
    DATABASE_URL: str = _DEFAULT_SQLITE

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # We install psycopg2-binary (SQLAlchemy dialect: postgresql+psycopg2).
        # Supabase connection strings often come as postgresql+psycopg:// (psycopg v3)
        # or bare postgresql:// — normalize both so the engine never tries to import
        # the psycopg v3 package which is not installed.
        if v.startswith("postgresql+psycopg://"):
            return "postgresql+psycopg2://" + v[len("postgresql+psycopg://"):]
        if v.startswith("postgresql://"):
            return "postgresql+psycopg2://" + v[len("postgresql://"):]
        return v

    # --- Auth ---
    # dev    -> we issue/verify our own HS256 JWTs (sub = user id)
    # supabase -> verify Supabase-issued JWTs (set SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL)
    AUTH_MODE: str = "dev"
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_HOURS: int = 720  # 30 days
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_JWKS_URL: str = ""

    # --- CORS / app ---
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    APP_BASE_URL: str = "http://localhost:5173"

    # --- Managed Claude (the "we provide the key" tier) ---
    MANAGED_CLAUDE_API_KEY: str = ""

    # --- Email (default provider; per-user config can override to smtp/resend) ---
    EMAIL_PROVIDER: str = "console"  # console | smtp | resend
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Jobpls <onboarding@resend.dev>"

    # --- Scheduler (system-wide cadence; per-user opt-out via their SCHEDULER_ENABLED) ---
    DISCOVERY_INTERVAL_HOURS: float = 6.0
    SCORING_INTERVAL_MINUTES: float = 30.0
    DIGEST_INTERVAL_HOURS: float = 24.0  # job-alert email cadence

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


settings = Settings()
