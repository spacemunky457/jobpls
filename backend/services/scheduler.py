"""Multi-user scheduler. One discovery tick + one match-assessment tick at a system-wide
cadence (from settings); each tick loops over all users, honoring their SCHEDULER_ENABLED
and running only the AI paths that work server-side (Claude / self-hosted Ollama).
Browser-Ollama users assess/tailor from the UI, so the tick skips their assessment."""

import logging
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from settings import settings

log = logging.getLogger(__name__)

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
    # Timezone-AWARE UTC: the scheduler runs in UTC, so a naive local time would be
    # mis-read as UTC and push the first run hours into the future (UTC-offset bug).
    now = datetime.now(timezone.utc)
    # coalesce + a generous misfire_grace_time make a laptop-friendly agent: if the
    # machine sleeps through a tick, the job fires once when it wakes (instead of being
    # silently skipped). next_run_time runs a fresh check ~soon after every startup, so
    # booting/logging in triggers discovery + a (deduped) digest.
    s.add_job(
        _discovery_tick, IntervalTrigger(hours=settings.DISCOVERY_INTERVAL_HOURS),
        id="discovery", replace_existing=True, coalesce=True,
        misfire_grace_time=int(settings.DISCOVERY_INTERVAL_HOURS * 3600),
        next_run_time=now + timedelta(seconds=30),
    )
    s.add_job(
        _assess_tick, IntervalTrigger(minutes=settings.SCORING_INTERVAL_MINUTES),
        id="assess", replace_existing=True, coalesce=True,
        misfire_grace_time=int(settings.SCORING_INTERVAL_MINUTES * 60),
    )
    s.add_job(
        _digest_tick, IntervalTrigger(hours=settings.DIGEST_INTERVAL_HOURS),
        id="digest", replace_existing=True, coalesce=True,
        misfire_grace_time=int(settings.DIGEST_INTERVAL_HOURS * 3600),
        next_run_time=now + timedelta(seconds=120),
    )
    log.info(
        "APScheduler started (discovery %sh, assess %smin, digest %sh; catch-up on wake/boot)",
        settings.DISCOVERY_INTERVAL_HOURS, settings.SCORING_INTERVAL_MINUTES, settings.DIGEST_INTERVAL_HOURS,
    )


def stop_scheduler():
    s = get_scheduler()
    if s.running:
        s.shutdown(wait=False)
        log.info("APScheduler stopped")


def _enabled_users(db):
    from models import Config, User
    users = db.query(User).all()
    result = []
    for u in users:
        row = db.query(Config).filter(Config.user_id == u.id, Config.key == "SCHEDULER_ENABLED").first()
        if row is None or str(row.value).lower() == "true":
            result.append(u)
    return result


def _discovery_tick():
    try:
        from database import SessionLocal
        from routers.pipeline import discovery_impl
        db = SessionLocal()
        try:
            for user in _enabled_users(db):
                try:
                    discovery_impl(db, user.id)
                except Exception as e:
                    log.error("Discovery failed for user %s: %s", user.id, e)
        finally:
            db.close()
    except Exception as e:
        log.error("Discovery tick failed: %s", e)


def _digest_tick():
    """Email each opted-in user a job-alert digest of new matches since the last run."""
    try:
        from database import SessionLocal
        from routers.config import get_config_dict
        from services import notify
        db = SessionLocal()
        try:
            window = int(settings.DIGEST_INTERVAL_HOURS) + 1
            for user in _enabled_users(db):
                config = get_config_dict(db, user.id)
                if str(config.get("DIGEST_ENABLED", "false")).lower() != "true":
                    continue
                try:
                    n = notify.send_digest(db, user, config, since_hours=window, mark=True)
                    if n:
                        log.info("Digest sent to %s (%d jobs)", notify.recipient_for(user, config), n)
                except Exception as e:
                    log.error("Digest failed for user %s: %s", user.id, e)
        finally:
            db.close()
    except Exception as e:
        log.error("Digest tick failed: %s", e)


def _assess_tick():
    try:
        from database import SessionLocal
        from routers.config import get_config_dict
        from routers.cv import get_default_cv_text
        from routers.pipeline import get_provider
        from services import matching as mt
        db = SessionLocal()
        try:
            for user in _enabled_users(db):
                config = get_config_dict(db, user.id)
                if config.get("AI_PROVIDER", "ollama_browser").lower() == "ollama_browser":
                    continue  # browser users assess from the UI
                try:
                    provider = get_provider(config)
                except Exception:
                    continue
                cv_text = get_default_cv_text(db, user.id)
                try:
                    mt.match_batch(db, provider, user.id, config, cv_text, int(config.get("SCORE_BATCH", "8")))
                except Exception as e:
                    log.error("Match assessment failed for user %s: %s", user.id, e)
        finally:
            db.close()
    except Exception as e:
        log.error("Assessment tick failed: %s", e)
