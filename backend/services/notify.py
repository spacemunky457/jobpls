"""Notifications: magic-link input requests + the job-alert digest email.
The email sender is built per-user from their config (console | smtp | resend)."""

import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from models import InputRequest, Job, User
from services.email.base import get_sender
from settings import settings

log = logging.getLogger(__name__)

TIER_RANK = {"strong": 3, "possible": 2, "stretch": 1, "skip": 0}


def _link(token: str) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/respond/{token}"


def _user_config(db: Session, user_id: str) -> dict:
    from routers.config import get_config_dict
    return get_config_dict(db, user_id)


def recipient_for(user: User, config: dict) -> str:
    """Where alerts go: the DIGEST_EMAIL override if set, else the account email.
    (Lets a user whose login is a throwaway address get alerts at their real inbox.)"""
    return (config.get("DIGEST_EMAIL") or "").strip() or (user.email or "")


def create_request(
    db: Session,
    user: User,
    type: str,
    prompt: str,
    job: Job | None = None,
    send_email: bool = True,
    ttl_days: int = 14,
) -> InputRequest:
    req = InputRequest(
        user_id=user.id,
        job_id=job.id if job else None,
        type=type,
        prompt=prompt,
        status="pending",
        expires_at=datetime.utcnow() + timedelta(days=ttl_days),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    config = _user_config(db, user.id)
    recipient = recipient_for(user, config)
    if send_email and recipient:
        subject = {
            "add_info": "Jobpls needs a bit more info",
            "tailor_cv": "Approve CV tailoring",
            "approve": "A job is ready for your approval",
        }.get(type, "Jobpls needs your input")
        ctx = f"<p><b>{job.title}</b> at <b>{job.company}</b></p>" if job else ""
        html = (
            f'<div style="font-family:Arial">'
            f"<h2>{subject}</h2>{ctx}<p>{prompt}</p>"
            f'<p><a href="{_link(req.token)}" '
            f'style="background:#1F4E79;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Respond</a></p>'
            f"</div>"
        )
        try:
            get_sender(config).send(recipient, subject, html)
        except Exception as e:
            log.error("Failed to send request email: %s", e)
    return req


def _tier_badge(tier: str) -> str:
    colors = {"strong": "#15803d", "possible": "#1F4E79", "stretch": "#b45309", "skip": "#6b7280"}
    c = colors.get((tier or "").lower(), "#6b7280")
    return f'<span style="background:{c};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">{(tier or "—").title()}</span>'


def _digest_html(heading: str, jobs: list[Job], assessed: bool) -> str:
    rows = ""
    for j in jobs:
        match_cell = f"{_tier_badge(j.tier)}" if assessed else '<span style="color:#6b7280">new</span>'
        verdict = (j.verdict or "") if assessed else (j.location or "")
        rows += (
            f'<tr style="border-bottom:1px solid #eee">'
            f'<td style="padding:8px" align="center">{match_cell}</td>'
            f'<td style="padding:8px"><b>{j.title}</b><br><span style="color:#6b7280">{j.company}</span></td>'
            f'<td style="padding:8px;color:#374151">{verdict}</td>'
            f'<td style="padding:8px;color:#6b7280">{j.eligibility or ""}</td>'
            f'<td style="padding:8px"><a href="{j.url}" style="color:#1F4E79">open</a></td></tr>'
        )
    return (
        f'<div style="font-family:Arial,sans-serif;max-width:680px">'
        f'<h2 style="color:#1F4E79">Jobpls — {len(jobs)} {heading}</h2>'
        f'<p style="color:#374151">{"Assessed against your CV." if assessed else "Fresh listings matching your keywords — open the app to assess your fit."}</p>'
        f'<table style="border-collapse:collapse;width:100%">'
        f'<tr style="background:#1F4E79;color:#fff">'
        f'<th style="padding:8px">Fit</th><th style="padding:8px" align="left">Role</th>'
        f'<th style="padding:8px" align="left">{"Verdict" if assessed else "Location"}</th>'
        f'<th style="padding:8px">Eligibility</th><th style="padding:8px">Link</th></tr>'
        f"{rows}</table>"
        f'<p style="margin-top:16px"><a href="{settings.APP_BASE_URL}" '
        f'style="background:#1F4E79;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open Jobpls</a></p>'
        f"</div>"
    )


def _set_config(db: Session, user_id: str, key: str, value: str) -> None:
    from models import Config
    row = db.query(Config).filter(Config.user_id == user_id, Config.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Config(user_id=user_id, key=key, value=value))
    db.commit()


def send_digest(db: Session, user: User, config: dict | None = None,
                since_hours: int | None = None, mark: bool = False) -> int:
    """Email the user their best current matches. Prefers assessed jobs at/above the
    configured tier and eligible for them; if there are none (e.g. browser-Ollama
    users who assess in-app), falls back to recent new keyword-matched jobs.

    mark=True (the scheduled agent): only include jobs added since the LAST digest
    (tracked per-user in LAST_DIGEST_AT), then advance that marker — so reboots and
    post-sleep catch-ups never re-email the same jobs. mark=False ('Send now'): show
    current matches and don't touch the marker. Raises on send failure."""
    config = config or _user_config(db, user.id)
    recipient = recipient_for(user, config)
    if not recipient:
        return 0

    min_rank = TIER_RANK.get((config.get("DIGEST_MIN_TIER", "possible") or "possible").lower(), 2)
    eligible = {t.strip() for t in (config.get("ELIGIBLE_TYPES", "global,emea,contractor")).split(",") if t.strip()}

    # Determine the "new since" cutoff.
    since_dt = None
    if mark:
        last = config.get("LAST_DIGEST_AT", "")
        if last:
            try:
                since_dt = datetime.fromisoformat(last)
            except ValueError:
                since_dt = None
        if since_dt is None and since_hours:
            since_dt = datetime.utcnow() - timedelta(hours=since_hours)
    elif since_hours:
        since_dt = datetime.utcnow() - timedelta(hours=since_hours)

    def eligible_ok(j: Job) -> bool:
        el = (j.eligibility or "")
        return (not eligible) or el in eligible or el in ("", "unclear")

    q = db.query(Job).filter(Job.user_id == user.id, Job.status == "assessed")
    if since_dt:
        q = q.filter(Job.added_at > since_dt)
    matches = [
        j for j in q.order_by(Job.match.desc()).all()
        if TIER_RANK.get((j.tier or "").lower(), 0) >= min_rank and eligible_ok(j)
    ]

    if matches:
        jobs, heading, assessed = matches, "matches for you", True
    else:
        nq = db.query(Job).filter(Job.user_id == user.id, Job.status == "new")
        if since_dt:
            nq = nq.filter(Job.added_at > since_dt)
        jobs, heading, assessed = nq.order_by(Job.added_at.desc()).limit(20).all(), "new jobs to review", False

    if not jobs:
        if mark:
            _set_config(db, user.id, "LAST_DIGEST_AT", datetime.utcnow().isoformat())
        return 0

    get_sender(config).send(recipient, f"Jobpls — {len(jobs)} {heading}", _digest_html(heading, jobs, assessed))
    if mark:
        _set_config(db, user.id, "LAST_DIGEST_AT", datetime.utcnow().isoformat())
    return len(jobs)
