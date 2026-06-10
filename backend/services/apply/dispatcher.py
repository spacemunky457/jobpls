"""Routes a job to the right apply channel, logs the attempt, and updates status.

Guardrails (this sends real applications):
- The applicant profile must have at least name + email.
- Only jobs the user has approved AND tailored (status 'drafted') are eligible.
- Job.status flips to 'applied' ONLY on a confirmed submission; failures keep the
  job in 'drafted' so the user can retry or finish manually, with the reason logged.
"""

import logging

from sqlalchemy.orm import Session

from models import ApplyAttempt, Application, ApplicantProfile, Job
from . import browser, email_apply
from .base import NotSupported, Outcome, find_apply_email, profile_complete

log = logging.getLogger(__name__)


def _log(db: Session, user_id: str, job_id: int, outcome: Outcome) -> None:
    detail = outcome.detail
    if outcome.trace:
        detail = detail + "\n\nSteps:\n" + "\n".join(f"• {s}" for s in outcome.trace)
    db.add(ApplyAttempt(
        user_id=user_id, job_id=job_id,
        method=outcome.method, state=outcome.state, detail=detail[:2000],
    ))


def run_apply(db: Session, user_id: str, job: Job, config: dict,
              headless: bool | None = None, autosubmit: bool | None = None) -> Outcome:
    """headless/autosubmit override the user's config for this one run (used by the
    per-job 'Apply (watch it)' action, which forces a visible browser)."""
    profile = db.query(ApplicantProfile).filter(ApplicantProfile.user_id == user_id).first()
    ok, msg = profile_complete(profile)
    if not ok:
        out = Outcome("manual", "skipped", msg)
        _log(db, user_id, job.id, out)
        db.commit()
        return out

    app = db.query(Application).filter(Application.job_id == job.id, Application.user_id == user_id).first()
    if not app:
        out = Outcome("manual", "skipped", "Tailor this job first — there's no application draft to send.")
        _log(db, user_id, job.id, out)
        db.commit()
        return out

    cv_text, email_text = app.cv_text or "", app.email_draft or ""
    if autosubmit is None:
        autosubmit = str(config.get("APPLY_AUTOSUBMIT", "true")).lower() == "true"
    if headless is None:
        headless = str(config.get("APPLY_HEADLESS", "true")).lower() == "true"

    # Primary channel: drive the real web form.
    try:
        out = browser.apply(job, profile, cv_text, email_text, autosubmit=autosubmit, headless=headless)
    except NotSupported as e:
        out = Outcome("browser", "failed", str(e))

    # Fallback: if the form path failed and the posting lists an apply email, email it.
    if out.state != "submitted" and find_apply_email(job.jd_text or ""):
        try:
            email_out = email_apply.apply(job, profile, cv_text, email_text)
            _log(db, user_id, job.id, out)  # keep the browser attempt in the log too
            out = email_out
        except NotSupported:
            pass

    _log(db, user_id, job.id, out)
    if out.state == "submitted":
        job.status = "applied"
    db.commit()
    return out


def apply_batch(db: Session, user_id: str, config: dict) -> list[Outcome]:
    """Auto-apply every approved + tailored job that hasn't been applied yet."""
    jobs = (
        db.query(Job)
        .filter(Job.user_id == user_id, Job.approved == True, Job.status == "drafted")
        .order_by(Job.added_at)
        .all()
    )
    results = []
    for job in jobs:
        try:
            results.append(run_apply(db, user_id, job, config))
        except Exception as e:
            log.error("apply_batch failed for job %s: %s", job.id, e)
            results.append(Outcome("manual", "failed", str(e)[:200]))
    return results
