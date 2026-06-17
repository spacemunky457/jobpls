"""Per-user seeding: default config, default sources, and a default tailoring profile.
Called on signup (dev auth) and on first-seen Supabase identity."""

from sqlalchemy.orm import Session
from models import ApplicantProfile, Config, Source, TailoringProfile

DEFAULT_CONFIG = {
    "AI_PROVIDER": "ollama_browser",  # ollama_browser | gemini_byok | claude_byok | claude_managed | ollama_server
    "OLLAMA_MODEL": "llama3.2",
    "OLLAMA_BASE_URL": "http://localhost:11434",
    "GEMINI_API_KEY": "",
    "GEMINI_MODEL": "gemini-2.5-flash",
    "CLAUDE_API_KEY": "",
    "CLAUDE_MODEL": "claude-haiku-4-5-20251001",
    "MIN_SCORE": "60",
    "SCORE_BATCH": "8",
    "KEYWORDS": "quality assurance,qa,automation,solutions engineer,customer success,implementation,ai automation,cx ops,support operations",
    # Comma-separated ban list: jobs whose location mentions one of these terms
    # are NOT ingested. e.g. "usa,united states,canada,india"
    "COUNTRY_BLOCKLIST": "",
    "PROFILE_BLURB": "",
    "JOB_PREFERENCES": "",
    "TARGET_PRIORITIES": "",      # niches to hunt for; matching roles get the "perfect" tier
    "ELIGIBLE_TYPES": "global,emea,contractor",
    "BLOCKLIST_COMPANIES": "",
    "SCHEDULER_ENABLED": "true",
    "DIGEST_EMAIL": "",
    # Auto-apply (browser bot runs locally):
    "APPLY_AUTOSUBMIT": "true",   # false = fill the form and pause for your review
    "APPLY_HEADLESS": "true",     # false = show the browser window while it applies
    # Job-alert email agent:
    "EMAIL_PROVIDER": "console",  # console | smtp | resend
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "",
    "SMTP_PASSWORD": "",          # Gmail: an app password, not your login password
    "EMAIL_FROM": "",
    "RESEND_API_KEY": "",
    "DIGEST_ENABLED": "false",    # email me new matches on a schedule
    "DIGEST_MIN_TIER": "possible",  # strong | possible | stretch | skip
    # Automation (the RUN AUTOMATION loop: discover -> assess -> expire -> digest):
    "AUTOMATION_ENABLED": "false",
    "AUTOMATION_INTERVAL_HOURS": "6",
    "DIGEST_MODE": "after_run",   # after_run (only when new matches) | daily
    "DIGEST_TIME": "09:00",       # used by daily mode (UTC, HH:MM)
    "JOB_EXPIRY_DAYS": "21",      # unactioned postings older than this auto-pass
    # Discovery breadth (keyed sources only run when a key is present):
    "JOB_LOCATION": "",           # default location for linkedin/adzuna/jsearch
    "ADZUNA_APP_ID": "",
    "ADZUNA_APP_KEY": "",
    "ADZUNA_COUNTRY": "gb",
    "JSEARCH_API_KEY": "",
}

DEFAULT_SOURCES = [
    ("remotive", "quality assurance"),
    ("remotive", "automation"),
    ("remotive", "customer support"),
    ("remotive", "customer success"),
    ("remotive", "implementation"),
    ("remoteok", ""),
    ("wwr", ""),
    ("workingnomads", ""),
    ("arbeitnow", ""),
    ("themuse", ""),
    ("linkedin", "quality assurance automation"),
    ("linkedin", "customer success remote"),
    # Verified remote-friendly Greenhouse company boards (no API key, no quota —
    # each returns the company's full board; we title-filter locally). Slugs checked
    # live against boards-api.greenhouse.io. remotecom = Remote.com.
    ("greenhouse", "gitlab"),
    ("greenhouse", "remotecom"),
    ("greenhouse", "stripe"),
    ("greenhouse", "dropbox"),
    ("greenhouse", "coinbase"),
    ("greenhouse", "databricks"),
    ("greenhouse", "cloudflare"),
    ("greenhouse", "brex"),
    ("greenhouse", "gusto"),
    ("greenhouse", "airbnb"),
    ("kariyer", ""),
    ("yenibiris", ""),
    ("lever", ""),
    ("ashby", ""),
    # Keyed aggregators (reach Indeed/LinkedIn/Glassdoor) — add keys in Settings to enable.
    # NOTE: JSearch free tier is quota-limited (~200-500 req/month). Each query below is
    # one API call per discovery cycle, so keep the jsearch list short or widen the
    # discovery interval. Adzuna's free tier is far more generous — lean on it for volume.
    ("jsearch", "quality assurance automation"),
    ("jsearch", "customer success manager remote"),
    ("jsearch", "implementation specialist remote"),
    ("adzuna", "quality assurance"),
    ("adzuna", "customer success"),
    ("adzuna", "implementation specialist"),
    ("adzuna", "solutions engineer"),
]


def seed_user(db: Session, user_id: str, email: str = "") -> None:
    cfg = dict(DEFAULT_CONFIG)
    if email:
        cfg["DIGEST_EMAIL"] = email
    for key, value in cfg.items():
        if not db.query(Config).filter(Config.user_id == user_id, Config.key == key).first():
            db.add(Config(user_id=user_id, key=key, value=value))

    if db.query(Source).filter(Source.user_id == user_id).count() == 0:
        for stype, query in DEFAULT_SOURCES:
            db.add(Source(user_id=user_id, type=stype, query=query, enabled=True))

    if db.query(TailoringProfile).filter(TailoringProfile.user_id == user_id).count() == 0:
        db.add(
            TailoringProfile(
                user_id=user_id,
                name="Default",
                is_default=True,
                options={
                    "tone": "warm and specific",
                    "length": "one page",
                    "emphasis": "",
                    "extra_instructions": "Never invent employers, tools, or numbers.",
                },
            )
        )

    if not db.query(ApplicantProfile).filter(ApplicantProfile.user_id == user_id).first():
        # Pre-fill the email from the account so auto-apply has a starting point.
        db.add(ApplicantProfile(user_id=user_id, email=email or ""))
    db.commit()
