import logging
from sqlalchemy.orm import Session
from models import Job
from services.ai.base import AIProvider

log = logging.getLogger(__name__)

TIERS = ("strong", "possible", "stretch", "skip")


def _clamp(val) -> int | None:
    try:
        n = int(val)
        return max(0, min(100, n))
    except (TypeError, ValueError):
        return None


def _tier(result: dict, match: int | None) -> str | None:
    """Prefer the model's tier; otherwise derive one from the match strength."""
    t = str(result.get("tier", "")).strip().lower()
    if t in TIERS:
        return t
    if match is None:
        return None
    if match >= 75:
        return "strong"
    if match >= 50:
        return "possible"
    if match >= 25:
        return "stretch"
    return "skip"


def apply_match(job: Job, result: dict) -> None:
    """Persist a parsed candidate-match result onto a job (shared by server + browser paths)."""
    m = _clamp(result.get("match"))
    job.match = m
    job.tier = _tier(result, m)
    job.eligibility = result.get("eligibility", "unclear")
    job.verdict = result.get("verdict", "")
    job.strengths = ", ".join(result.get("strengths") or [])
    job.gaps = ", ".join(result.get("gaps") or [])
    job.status = "assessed"


def match_batch(
    db: Session,
    provider: AIProvider,
    user_id: str,
    config: dict,
    cv_text: str,
    limit: int = 8,
) -> int:
    profile = config.get("PROFILE_BLURB", "")
    preferences = config.get("JOB_PREFERENCES", "")
    eligible_types = config.get("ELIGIBLE_TYPES", "global,emea,contractor")

    jobs = (
        db.query(Job)
        .filter(Job.user_id == user_id, Job.status == "new")
        .order_by(Job.added_at)
        .limit(limit)
        .all()
    )
    done = 0
    for job in jobs:
        job_dict = {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "jd_text": job.jd_text or "",
        }
        try:
            result = provider.assess_match(profile, cv_text, preferences, eligible_types, job_dict)
        except Exception as e:
            log.error("Match assessment failed for job %s: %s", job.id, e)
            job.status = f"error:{str(e)[:60]}"
            db.commit()
            done += 1
            continue
        apply_match(job, result)
        db.commit()
        done += 1
    return done
