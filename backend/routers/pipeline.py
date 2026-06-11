import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Application, Job, SeenJob, Source, User
from routers.config import get_config_dict
from routers.cv import get_default_cv_text
from routers.tailoring_profiles import get_default_profile_options
from schemas import PipelineResult, PreparedTask, ResultsBatch
from services import discovery as disc
from services import matching as mt
from services import prompts
from services import tailoring as tail
from settings import settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def get_provider(config: dict):
    """Server-side provider. Browser-Ollama has no server provider — the browser runs it."""
    provider_type = config.get("AI_PROVIDER", "ollama_browser").lower()
    if provider_type == "ollama_server":
        from services.ai.ollama_provider import OllamaProvider
        return OllamaProvider(
            model=config.get("OLLAMA_MODEL", "llama3.2"),
            base_url=config.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        )
    if provider_type == "gemini_byok":
        from services.ai.gemini_provider import GeminiProvider
        return GeminiProvider(
            api_key=config.get("GEMINI_API_KEY", ""),
            model=config.get("GEMINI_MODEL", "gemini-2.5-flash"),
        )
    if provider_type == "claude_byok":
        from services.ai.claude_provider import ClaudeProvider
        return ClaudeProvider(api_key=config.get("CLAUDE_API_KEY", ""), model=config.get("CLAUDE_MODEL", "claude-haiku-4-5"))
    if provider_type == "claude_managed":
        from services.ai.claude_provider import ClaudeProvider
        return ClaudeProvider(api_key=settings.MANAGED_CLAUDE_API_KEY, model=config.get("CLAUDE_MODEL", "claude-haiku-4-5"))
    raise ValueError(
        "This provider runs in your browser. Use the 'Run with local Ollama' buttons, "
        "or switch to Google Gemini / Claude in Setup → Matching engine."
    )


# --- Discovery (no AI, always server-side) ---
def discovery_impl(db: Session, user_id: str) -> int:
    config = get_config_dict(db, user_id)
    keywords = [k.strip().lower() for k in config.get("KEYWORDS", "").split(",") if k.strip()]
    sources = [
        {"type": s.type, "query": s.query, "enabled": s.enabled}
        for s in db.query(Source).filter(Source.user_id == user_id, Source.enabled == True).all()
    ]
    seen_keys = {r.key for r in db.query(SeenJob.key).filter(SeenJob.user_id == user_id).all()}
    secrets = {
        "location": config.get("JOB_LOCATION", ""),
        "adzuna_app_id": config.get("ADZUNA_APP_ID", ""),
        "adzuna_app_key": config.get("ADZUNA_APP_KEY", ""),
        "adzuna_country": config.get("ADZUNA_COUNTRY", "gb"),
        "jsearch_key": config.get("JSEARCH_API_KEY", ""),
    }
    new_jobs, new_keys = disc.run_discovery(sources, keywords, seen_keys, secrets)
    # Country ban list: drop jobs whose location mentions a banned term. Jobs with
    # no location are kept (can't judge them here; match assessment handles
    # eligibility). All fetched keys are still marked seen so skips don't recur.
    banned = [c.strip().lower() for c in config.get("COUNTRY_BLOCKLIST", "").split(",") if c.strip()]
    if banned:
        new_jobs = [
            j for j in new_jobs
            if not any(c in (j.get("location") or "").lower() for c in banned)
        ]
    for j in new_jobs:
        db.add(Job(
            user_id=user_id,
            source=j["source"], external_id=j["id"], company=j.get("company", ""),
            title=j.get("title", ""), location=j.get("location", ""), url=j.get("url", ""),
            jd_text=j.get("description", "")[:8000], status="new",
        ))
    for key in new_keys:
        db.add(SeenJob(user_id=user_id, key=key))
    db.commit()
    return len(new_jobs)


@router.post("/discover", response_model=PipelineResult)
def run_discovery(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        count = discovery_impl(db, current_user.id)
        return PipelineResult(success=True, message=f"Added {count} new jobs", count=count)
    except Exception as e:
        log.error("Discovery error: %s", e)
        return PipelineResult(success=False, message=str(e))


# --- Server-side match assessment / approvals (Claude or self-hosted Ollama) ---
@router.post("/assess", response_model=PipelineResult)
def run_assessment(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = get_config_dict(db, current_user.id)
    try:
        provider = get_provider(config)
    except Exception as e:
        return PipelineResult(success=False, message=str(e))
    cv_text = get_default_cv_text(db, current_user.id)
    count = mt.match_batch(db, provider, current_user.id, config, cv_text, int(config.get("SCORE_BATCH", "8")))
    return PipelineResult(success=True, message=f"Assessed {count} jobs", count=count)


@router.post("/process-approvals", response_model=PipelineResult)
def run_approvals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = get_config_dict(db, current_user.id)
    try:
        provider = get_provider(config)
    except Exception as e:
        return PipelineResult(success=False, message=str(e))
    cv_text = get_default_cv_text(db, current_user.id)
    options = get_default_profile_options(db, current_user.id)
    count = tail.process_approvals(db, provider, current_user.id, config, cv_text, options)
    return PipelineResult(success=True, message=f"Processed {count} approvals", count=count)


# --- Browser-driven Ollama: prepare prompts here, model runs in the browser, ingest results ---
@router.get("/assess/batch", response_model=list[PreparedTask])
def prepare_assessment(
    limit: int = Query(8, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = get_config_dict(db, current_user.id)
    cv_text = get_default_cv_text(db, current_user.id)
    profile = config.get("PROFILE_BLURB", "")
    preferences = config.get("JOB_PREFERENCES", "")
    eligible_types = config.get("ELIGIBLE_TYPES", "global,emea,contractor")
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.status == "new")
        .order_by(Job.added_at)
        .limit(limit)
        .all()
    )
    out = []
    for job in jobs:
        job_dict = {"title": job.title, "company": job.company, "location": job.location, "jd_text": job.jd_text or ""}
        out.append(PreparedTask(job_id=job.id, prompt=prompts.build_match_prompt(profile, cv_text, preferences, eligible_types, job_dict)))
    return out


@router.post("/assess/results", response_model=PipelineResult)
def ingest_assessments(
    body: ResultsBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    done = 0
    for item in body.results:
        job = db.query(Job).filter(Job.id == item.get("job_id"), Job.user_id == current_user.id).first()
        if not job:
            continue
        mt.apply_match(job, prompts.parse_match(item.get("raw", "")))
        done += 1
    db.commit()
    return PipelineResult(success=True, message=f"Assessed {done} jobs", count=done)


@router.get("/tailor/batch", response_model=list[PreparedTask])
def prepare_tailor(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = get_config_dict(db, current_user.id)
    cv_text = get_default_cv_text(db, current_user.id)
    options = get_default_profile_options(db, current_user.id)
    profile = config.get("PROFILE_BLURB", "")
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id, Job.approved == True, Job.status.notin_(["drafted", "applied"]))
        .all()
    )
    out = []
    for job in jobs:
        if (job.status or "").startswith("error"):
            continue
        job_dict = {"title": job.title, "company": job.company, "location": job.location, "jd_text": job.jd_text or ""}
        extra_info = tail.get_extra_info(db, current_user.id, job.id)
        out.append(PreparedTask(job_id=job.id, prompt=prompts.build_tailor_prompt(profile, cv_text, job_dict, options, extra_info)))
    return out


@router.post("/tailor/results", response_model=PipelineResult)
def ingest_tailor(
    body: ResultsBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    done = 0
    for item in body.results:
        job = db.query(Job).filter(Job.id == item.get("job_id"), Job.user_id == current_user.id).first()
        if not job:
            continue
        parsed = prompts.parse_tailor(item.get("raw", ""))
        tail.save_application(db, current_user.id, job, parsed.get("cv", ""), parsed.get("email", ""))
        done += 1
    return PipelineResult(success=True, message=f"Tailored {done} applications", count=done)
