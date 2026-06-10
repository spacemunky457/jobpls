"""Shared types + helpers for apply adapters."""

import os
import re
import tempfile
from dataclasses import dataclass, field


class NotSupported(Exception):
    """An adapter can't handle this job — the dispatcher moves on to the next channel."""


@dataclass
class Outcome:
    method: str          # greenhouse_form | lever_form | ashby_form | generic_form | email | manual
    state: str           # submitted | failed | skipped
    detail: str = ""
    trace: list = field(default_factory=list)  # human-readable step log, shown in the UI


def full_name(profile) -> str:
    return f"{(profile.first_name or '').strip()} {(profile.last_name or '').strip()}".strip()


def profile_complete(profile) -> tuple[bool, str]:
    """Auto-apply needs at least a name + email. Returns (ok, message)."""
    if profile is None:
        return False, "Set up your applicant profile in Settings → Applicant before applying."
    missing = []
    if not (profile.first_name or "").strip():
        missing.append("first name")
    if not (profile.last_name or "").strip():
        missing.append("last name")
    if not (profile.email or "").strip():
        missing.append("email")
    if missing:
        return False, "Complete your applicant profile first (missing: " + ", ".join(missing) + ")."
    return True, ""


_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def find_apply_email(text: str) -> str:
    """Pull a plausible application email out of a JD, preferring jobs@/careers@/hr@."""
    if not text:
        return ""
    emails = _EMAIL_RE.findall(text)
    if not emails:
        return ""
    preferred = ("jobs", "careers", "career", "hr", "recruit", "talent", "apply", "hiring", "people")
    for e in emails:
        local = e.split("@", 1)[0].lower()
        if any(p in local for p in preferred):
            return e
    # Skip obvious non-apply addresses (support/sales/no-reply) if anything else exists.
    skip = ("support", "sales", "noreply", "no-reply", "info", "press", "privacy", "legal")
    nonskip = [e for e in emails if not any(s in e.split("@", 1)[0].lower() for s in skip)]
    return (nonskip or emails)[0]


def _safe_name(name_hint: str) -> str:
    return "".join(c for c in name_hint if c.isalnum() or c in " _-").strip()[:40] or "CV"


def write_resume_file(cv_text: str, name_hint: str = "CV") -> str:
    """Write the tailored CV to a temp .txt for upload; returns the path. Caller cleans up."""
    fd, path = tempfile.mkstemp(prefix=f"{_safe_name(name_hint)}_", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(cv_text or "")
    return path


def write_resume_pdf(cv_text: str, name_hint: str = "CV") -> str:
    """Write the tailored CV to a temp .pdf for upload (forms prefer PDF). Falls
    back to a .txt file if PDF generation fails. Returns the path; caller cleans up."""
    try:
        from services.pdf import cv_text_to_pdf
        data = cv_text_to_pdf(cv_text or "")
        fd, path = tempfile.mkstemp(prefix=f"{_safe_name(name_hint)}_", suffix=".pdf")
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return path
    except Exception:
        return write_resume_file(cv_text, name_hint)
