"""Email-apply: when a posting lists an application address, send the cover note +
CV to it. The pluggable EmailSender has no attachment support, so the CV goes
inline in the body — acceptable as a fallback channel."""

import html
import logging

from services.email.base import get_sender
from .base import Outcome, find_apply_email, full_name

log = logging.getLogger(__name__)


def apply(job, profile, cv_text: str, email_text: str) -> Outcome:
    to = find_apply_email(job.jd_text or "")
    if not to:
        from .base import NotSupported
        raise NotSupported("no application email in the posting")

    subject = f"Application: {job.title} — {full_name(profile)}"
    body = email_text or f"Hello,\n\nI'd like to apply for {job.title}. My CV is below.\n\n— {full_name(profile)}"
    contact = " · ".join(filter(None, [profile.email, profile.phone, profile.linkedin]))
    composed = (
        f"<div style='font-family:system-ui,sans-serif;white-space:pre-wrap'>"
        f"{html.escape(body)}\n\n"
        f"{html.escape(contact)}\n\n"
        f"{'—' * 20}\nCV\n{'—' * 20}\n\n"
        f"{html.escape(cv_text or '')}"
        f"</div>"
    )
    try:
        get_sender().send(to, subject, composed)
    except Exception as e:
        return Outcome("email", "failed", f"email send failed: {str(e)[:160]}")
    return Outcome("email", "submitted", f"emailed application to {to}")
