"""One-shot agent: discover -> assess -> expire -> digest for all automation-enabled users.
Run directly or via a scheduler (GitHub Actions cron, etc.)."""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

from database import Base, engine, SessionLocal
import models  # noqa: F401 — registers all tables with Base.metadata

Base.metadata.create_all(bind=engine)

from models import Run, User
from routers.config import get_config_dict
from services.automation import is_running, run_cycle


def main() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).all()
        log.info("Agent started — %d user(s) in DB", len(users))
        for user in users:
            config = get_config_dict(db, user.id)
            if config.get("AUTOMATION_ENABLED", "false") != "true":
                log.info("Skipping %s (AUTOMATION_ENABLED != true)", user.email)
                continue
            if is_running(db, user.id):
                log.info("Skipping %s (cycle already in progress)", user.email)
                continue
            run = Run(user_id=user.id, kind="auto", phase="queued")
            db.add(run)
            db.commit()
            db.refresh(run)
            log.info("Running cycle for %s (run_id=%s)", user.email, run.id)
            run_cycle(user.id, run.id)  # synchronous — no thread needed here
        log.info("Agent done")
    finally:
        db.close()


if __name__ == "__main__":
    main()
