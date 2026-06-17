"""The RUN AUTOMATION engine: one cycle = discover -> assess -> expire -> digest.
Cycles run in a worker thread with their own DB session and persist progress on a
Run row so the UI can poll. Scheduled cycles are triggered by the scheduler tick;
manual ones by POST /automation/run-now."""

import logging
import threading
from datetime import datetime, time as dtime, timedelta

from sqlalchemy.orm import Session

from models import Job, Run, User

log = logging.getLogger(__name__)

# Safety cap: never assess more than this many jobs in one cycle.
MAX_ASSESS_PER_CYCLE = 200

TERMINAL_PHASES = ("done", "error")

# A cycle "running" longer than this is presumed dead (hung fetch, killed
# thread): reaped so a stale Run row can't wedge the scheduler forever.
STALE_RUN_HOURS = 3


def _reap(db: Session, q, message: str) -> int:
    n = q.update(
        {Run.phase: "error", Run.error: message, Run.finished_at: datetime.utcnow()},
        synchronize_session=False,
    )
    if n:
        db.commit()
        log.warning("Reaped %d dead run(s): %s", n, message)
    return n


def reap_interrupted_runs(db: Session) -> int:
    """Startup cleanup: worker threads don't survive a restart (or a --reload),
    so any unfinished run is dead by definition."""
    return _reap(
        db, db.query(Run).filter(Run.phase.notin_(TERMINAL_PHASES)),
        "interrupted by server restart",
    )


def is_running(db: Session, user_id: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=STALE_RUN_HOURS)
    _reap(
        db,
        db.query(Run).filter(
            Run.user_id == user_id,
            Run.phase.notin_(TERMINAL_PHASES),
            Run.started_at < cutoff,
        ),
        f"no progress for {STALE_RUN_HOURS}h — presumed dead",
    )
    return (
        db.query(Run)
        .filter(Run.user_id == user_id, Run.phase.notin_(TERMINAL_PHASES))
        .count()
        > 0
    )


def latest_run(db: Session, user_id: str, kind: str | None = None) -> Run | None:
    q = db.query(Run).filter(Run.user_id == user_id)
    if kind:
        q = q.filter(Run.kind == kind)
    return q.order_by(Run.started_at.desc()).first()


def start_run(db: Session, user_id: str, kind: str = "manual") -> Run:
    """Create the Run row and kick off the cycle in a daemon thread."""
    run = Run(user_id=user_id, kind=kind, phase="queued")
    db.add(run)
    db.commit()
    db.refresh(run)
    threading.Thread(target=run_cycle, args=(user_id, run.id), daemon=True).start()
    return run


def _digest_due(config: dict, now: datetime) -> bool:
    mode = config.get("DIGEST_MODE", "after_run")
    if mode == "after_run":
        return True  # send_digest(mark=True) only emails jobs new since the last digest
    # daily: send on the first cycle after DIGEST_TIME (UTC) if not already sent today
    try:
        hh, mm = (config.get("DIGEST_TIME", "09:00") or "09:00").split(":")
        target = dtime(int(hh), int(mm))
    except ValueError:
        target = dtime(9, 0)
    if now.time() < target:
        return False
    last = config.get("LAST_DIGEST_AT", "")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if last_dt.date() == now.date() and last_dt.time() >= target:
                return False
        except ValueError:
            pass
    return True


def run_cycle(user_id: str, run_id: int) -> None:
    """Worker-thread entry point: owns its session, never raises."""
    from database import SessionLocal
    from routers.config import get_config_dict
    from routers.cv import get_default_cv_text
    from routers.pipeline import discovery_impl, get_provider
    from services import matching as mt
    from services import notify

    db = SessionLocal()
    try:
        run = db.get(Run, run_id)
        user = db.get(User, user_id)
        if not run or not user:
            return
        config = get_config_dict(db, user_id)

        # 1) Discover
        run.phase = "discovering"
        db.commit()
        try:
            run.found = discovery_impl(db, user_id)
        except Exception as e:
            log.error("Automation discovery failed for %s: %s", user_id, e)
        db.commit()

        # 2) Assess — server-side providers only; browser-Ollama users assess in the UI.
        provider = None
        try:
            provider = get_provider(config)
        except Exception as e:
            # Silent skip here was a debugging black hole: jobs pile up at "new" with
            # no clue why. Log the actual reason so the cron output is diagnosable
            # (e.g. AI_PROVIDER=ollama_browser, or a missing/empty Gemini key).
            log.warning(
                "Assessment skipped for %s — no server-side AI provider (AI_PROVIDER=%s): %s",
                user_id, config.get("AI_PROVIDER", "?"), e,
            )
        if provider:
            run.phase = "assessing"
            db.commit()
            cv_text = get_default_cv_text(db, user_id)
            batch = max(1, int(config.get("SCORE_BATCH", "8") or 8))
            total = 0
            while total < MAX_ASSESS_PER_CYCLE:
                n = mt.match_batch(db, provider, user_id, config, cv_text, batch)
                total += n
                run.assessed = total
                db.commit()
                if n < batch:
                    break

        # 3) Expire stale, unactioned postings so the review deck stays fresh.
        run.phase = "expiring"
        db.commit()
        try:
            days = int(config.get("JOB_EXPIRY_DAYS", "21") or 21)
        except ValueError:
            days = 21
        if days > 0:
            cutoff = datetime.utcnow() - timedelta(days=days)
            run.expired = (
                db.query(Job)
                .filter(
                    Job.user_id == user_id,
                    Job.status.in_(["new", "assessed"]),
                    Job.approved == False,  # noqa: E712
                    Job.added_at < cutoff,
                )
                .update({Job.status: "passed"}, synchronize_session=False)
            )
            db.commit()

        # 4) Digest (never sent empty — notify handles that).
        run.phase = "digesting"
        db.commit()
        if _digest_due(config, datetime.utcnow()):
            try:
                run.digest_sent = notify.send_digest(db, user, config, mark=True)
            except Exception as e:
                log.error("Automation digest failed for %s: %s", user_id, e)

        run.phase = "done"
        run.finished_at = datetime.utcnow()
        db.commit()
        log.info(
            "Run %s for %s done: %d found, %d assessed, %d expired, digest %d",
            run.id, user_id, run.found, run.assessed, run.expired, run.digest_sent,
        )
    except Exception as e:
        log.error("Run %s crashed: %s", run_id, e)
        try:
            run = db.get(Run, run_id)
            if run:
                run.phase = "error"
                run.error = str(e)[:500]
                run.finished_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
