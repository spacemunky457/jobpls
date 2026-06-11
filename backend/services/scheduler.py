"""Per-user automation scheduler. One master tick every 15 minutes checks which
users are due (AUTOMATION_ENABLED + their own AUTOMATION_INTERVAL_HOURS elapsed
since their last auto run) and launches a full cycle for each:
discover -> assess (server-side providers) -> expire -> digest.

Browser-Ollama users still get discovery/expiry/digest on schedule; the assess
phase is skipped for them (they assess from the UI) — the automation tile in the
app nudges them toward Gemini for fully hands-free runs."""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)

TICK_MINUTES = 15

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone="UTC")
    return _scheduler


def start_scheduler():
    s = get_scheduler()
    if s.running:
        return
    s.start()
    # Timezone-AWARE UTC + coalesce + generous misfire grace: laptop-friendly —
    # if the machine sleeps through ticks, one fires on wake instead of being
    # silently skipped, and a fresh check runs shortly after every startup.
    now = datetime.now(timezone.utc)
    s.add_job(
        _automation_tick, IntervalTrigger(minutes=TICK_MINUTES),
        id="automation", replace_existing=True, coalesce=True,
        misfire_grace_time=TICK_MINUTES * 60,
        next_run_time=now + timedelta(seconds=60),
    )
    log.info("APScheduler started (automation tick every %dmin; per-user intervals)", TICK_MINUTES)


def stop_scheduler():
    s = get_scheduler()
    if s.running:
        s.shutdown(wait=False)
        log.info("APScheduler stopped")


def _automation_tick():
    """Find due users and run their cycles sequentially on this worker thread."""
    try:
        from database import SessionLocal
        from models import Run, User
        from routers.config import get_config_dict
        from services import automation

        db = SessionLocal()
        try:
            due: list[str] = []
            for user in db.query(User).all():
                config = get_config_dict(db, user.id)
                if config.get("AUTOMATION_ENABLED", "false") != "true":
                    continue
                if automation.is_running(db, user.id):
                    continue
                try:
                    interval = float(config.get("AUTOMATION_INTERVAL_HOURS", "6") or 6)
                except ValueError:
                    interval = 6.0
                last = automation.latest_run(db, user.id, kind="auto")
                if last and last.started_at > datetime.utcnow() - timedelta(hours=interval):
                    continue
                due.append(user.id)

            for user_id in due:
                run = Run(user_id=user_id, kind="auto", phase="queued")
                db.add(run)
                db.commit()
                db.refresh(run)
                # Run inline (we're already on a scheduler worker thread) so cycles
                # for multiple users execute sequentially, not in a thread herd.
                automation.run_cycle(user_id, run.id)
        finally:
            db.close()
    except Exception as e:
        log.error("Automation tick failed: %s", e)
