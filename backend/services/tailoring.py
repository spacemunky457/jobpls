import logging
from sqlalchemy.orm import Session
from models import Application, InputRequest, Job
from services.ai.base import AIProvider

log = logging.getLogger(__name__)


def get_extra_info(db: Session, user_id: str, job_id: int) -> str:
    """Most recent answered 'add_info' response for a job, injected into tailoring."""
    req = (
        db.query(InputRequest)
        .filter(
            InputRequest.user_id == user_id,
            InputRequest.job_id == job_id,
            InputRequest.type == "add_info",
            InputRequest.status == "answered",
        )
        .order_by(InputRequest.answered_at.desc())
        .first()
    )
    return req.response if req and req.response else ""


def clean_text(s: str) -> str:
    """Normalize model output for storage/display. Small local models frequently
    double-escape inside their JSON strings, so real line breaks arrive as the
    literal two characters '\\n' (and '\\t'/'\\r') and show up verbatim in the CV.
    Convert those back to real whitespace and tidy stray carriage returns."""
    if not s:
        return ""
    s = (
        s.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace("\\r", "\n")
        .replace("\r", "")
    )
    # Collapse 3+ consecutive blank lines down to a single blank line.
    while "\n\n\n" in s:
        s = s.replace("\n\n\n", "\n\n")
    return s.strip()


def save_application(db: Session, user_id: str, job: Job, cv_out: str, email_out: str) -> Application:
    """Create/replace the drafted application for a job (shared by server + browser paths).
    CV text lives in the DB (no local-disk writes — works on ephemeral hosts)."""
    cv_out, email_out = clean_text(cv_out), clean_text(email_out)
    app = (
        db.query(Application)
        .filter(Application.job_id == job.id, Application.user_id == user_id)
        .first()
    )
    if app:
        app.cv_text = cv_out
        app.email_draft = email_out
    else:
        app = Application(user_id=user_id, job_id=job.id, cv_text=cv_out, email_draft=email_out)
        db.add(app)
    job.status = "drafted"
    db.commit()
    db.refresh(app)
    return app


def process_approvals(
    db: Session,
    provider: AIProvider,
    user_id: str,
    config: dict,
    cv_text: str,
    profile_options: dict,
) -> int:
    profile = config.get("PROFILE_BLURB", "")
    jobs = (
        db.query(Job)
        .filter(Job.user_id == user_id, Job.approved == True, Job.status.notin_(["drafted", "applied"]))
        .all()
    )
    done = 0
    for job in jobs:
        if (job.status or "").startswith("error"):
            continue
        job_dict = {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "jd_text": job.jd_text or "",
        }
        extra_info = get_extra_info(db, user_id, job.id)
        try:
            result = provider.tailor_cv(profile, cv_text, job_dict, profile_options, extra_info)
        except Exception as e:
            log.error("Tailoring failed for job %s: %s", job.id, e)
            job.status = f"error:tailor:{str(e)[:40]}"
            db.commit()
            continue
        save_application(db, user_id, job, result.get("cv", ""), result.get("email", ""))
        done += 1
    return done
