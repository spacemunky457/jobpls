import logging
from sqlalchemy.orm import Session
from models import Job
from services.ai.base import AIProvider

log = logging.getLogger(__name__)

TIERS = ("perfect", "strong", "possible", "stretch", "skip")

# Below this many chars a job has effectively no description (some sources — e.g.
# the LinkedIn guest endpoint and Kariyer — return listings with an empty body).
# There's nothing to assess fit against, so we skip the API call entirely.
MIN_JD_CHARS = 40


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
    if match >= 93:
        return "perfect"
    if match >= 75:
        return "strong"
    if match >= 50:
        return "possible"
    if match >= 25:
        return "stretch"
    return "skip"


def apply_match(job: Job, result: dict) -> bool:
    """Persist a parsed candidate-match result onto a job (shared by server +
    browser paths). Returns False — leaving the job untouched — when the parse
    carried no signal (empty/truncated AI response): marking such a job
    "assessed" would park it forever with no tier, invisible to digests."""
    m = _clamp(result.get("match"))
    tier = _tier(result, m)
    if m is None and tier is None and not str(result.get("verdict") or "").strip():
        return False
    job.match = m
    job.tier = tier
    job.eligibility = result.get("eligibility", "unclear")
    job.verdict = result.get("verdict", "")
    job.strengths = ", ".join(result.get("strengths") or [])
    job.gaps = ", ".join(result.get("gaps") or [])
    job.status = "assessed"
    return True


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
    priorities = config.get("TARGET_PRIORITIES", "")
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
        if len((job.jd_text or "").strip()) < MIN_JD_CHARS:
            # No usable description — don't burn an API call (or quota) on a job the
            # model can't assess; mark a clear skip instead of "error:empty AI response".
            job.match = None
            job.tier = "skip"
            job.eligibility = "unclear"
            job.verdict = "No job description available to assess — the listing has no body text."
            job.strengths = ""
            job.gaps = ""
            job.status = "assessed"
            db.commit()
            done += 1
            continue
        job_dict = {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "jd_text": job.jd_text or "",
        }
        try:
            result = provider.assess_match(profile, cv_text, preferences, eligible_types, job_dict, priorities)
        except Exception as e:
            msg = str(e)
            log.error("Match assessment failed for job %s: %s", job.id, e)
            # A free-tier rate limit is transient — don't burn the job to "error"
            # (which never retries). Leave it "new" and stop the batch so the next
            # cycle picks up where we left off instead of hammering a throttled API.
            if "rate limit" in msg.lower() or "429" in msg:
                log.warning("Rate limited — stopping batch; remaining jobs stay 'new' for next cycle")
                break
            job.status = f"error:{str(e)[:60]}"
            db.commit()
            done += 1
            continue
        if not apply_match(job, result):
            log.error("Empty assessment for job %s — marking error", job.id)
            job.status = "error:empty AI response"
        db.commit()
        done += 1
    return done
