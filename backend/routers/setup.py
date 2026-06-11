"""Setup wizard support: per-area completion state (drives the wizard's resume +
Home's nudge tiles) and server-side AI key tests for the engine step."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import MasterCV, Source, User
from routers.config import get_config_dict

log = logging.getLogger(__name__)
router = APIRouter(prefix="/setup", tags=["setup"])

# Providers the backend can drive itself (required for scheduled automation).
SERVER_PROVIDERS = ("gemini_byok", "claude_byok", "claude_managed", "ollama_server")

PROVIDER_LABEL = {
    "ollama_browser": "Local Ollama (browser)",
    "ollama_server": "Ollama (server-side)",
    "gemini_byok": "Google Gemini",
    "claude_byok": "Claude (your key)",
    "claude_managed": "Claude (managed)",
}


def _ai_state(config: dict) -> tuple[bool, str]:
    provider = config.get("AI_PROVIDER", "ollama_browser")
    label = PROVIDER_LABEL.get(provider, provider)
    if provider == "gemini_byok":
        if config.get("GEMINI_API_KEY", "").strip():
            return True, f"{label} · {config.get('GEMINI_MODEL', 'gemini-2.5-flash')}"
        return False, "Gemini selected — API key missing"
    if provider == "claude_byok":
        if config.get("CLAUDE_API_KEY", "").strip():
            return True, f"{label} · {config.get('CLAUDE_MODEL', '')}"
        return False, "Claude selected — API key missing"
    if provider == "claude_managed":
        return False, "Managed Claude isn't available yet"
    # Ollama paths: nothing to verify server-side; the wizard tests from the browser.
    return True, f"{label} · {config.get('OLLAMA_MODEL', 'llama3.2')}"


def _email_state(config: dict) -> tuple[bool, str]:
    provider = config.get("EMAIL_PROVIDER", "console")
    if provider == "smtp":
        ok = bool(config.get("SMTP_USER", "").strip() and config.get("SMTP_PASSWORD", "").strip())
        return ok, "SMTP configured" if ok else "SMTP selected — credentials missing"
    if provider == "resend":
        ok = bool(config.get("RESEND_API_KEY", "").strip())
        return ok, "Resend configured" if ok else "Resend selected — API key missing"
    return True, "Console (dev — emails print to the backend log)"


@router.get("/state")
def setup_state(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = get_config_dict(db, current_user.id)

    profile_ok = bool(config.get("PROFILE_BLURB", "").strip())
    default_cv = (
        db.query(MasterCV)
        .filter(MasterCV.user_id == current_user.id, MasterCV.is_default == True)  # noqa: E712
        .first()
    ) or db.query(MasterCV).filter(MasterCV.user_id == current_user.id).first()
    cv_ok = bool(default_cv and len((default_cv.content or "").strip()) > 100)
    ai_ok, ai_summary = _ai_state(config)
    sources_on = (
        db.query(Source)
        .filter(Source.user_id == current_user.id, Source.enabled == True)  # noqa: E712
        .count()
    )
    email_ok, email_summary = _email_state(config)
    automation_on = config.get("AUTOMATION_ENABLED", "false") == "true"
    provider = config.get("AI_PROVIDER", "ollama_browser")
    ai_server = provider in SERVER_PROVIDERS and ai_ok

    return {
        "areas": {
            "you": {
                "complete": profile_ok,
                "summary": (config.get("PROFILE_BLURB", "")[:80] or "Tell the AI who you are"),
            },
            "cv": {
                "complete": cv_ok,
                "summary": default_cv.name if default_cv else "No CV yet",
            },
            "engine": {"complete": ai_ok, "summary": ai_summary},
            "sources": {
                "complete": sources_on > 0,
                "summary": f"{sources_on} source{'s' if sources_on != 1 else ''} enabled",
            },
            "automation": {
                "complete": automation_on,
                "summary": (
                    f"On · every {config.get('AUTOMATION_INTERVAL_HOURS', '6')}h"
                    if automation_on
                    else "Off — enable to run hands-free"
                ),
            },
        },
        # The app is usable once these are true; automation additionally needs ai_server+email.
        "usable": cv_ok and ai_ok,
        "ai_server": ai_server,
        "email_ready": email_ok,
        "email_summary": email_summary,
        "cv_ready": cv_ok,
    }


class TestAIRequest(BaseModel):
    provider: str           # gemini_byok | claude_byok
    api_key: str = ""
    model: str = ""


@router.post("/test-ai")
def test_ai(body: TestAIRequest, current_user: User = Depends(get_current_user)):
    """Fire one tiny completion against the chosen provider to validate the key.
    (Ollama is tested from the browser, where it actually runs.)"""
    try:
        if body.provider == "gemini_byok":
            from services.ai.gemini_provider import GeminiProvider
            provider = GeminiProvider(api_key=body.api_key, model=body.model or "gemini-2.5-flash")
        elif body.provider == "claude_byok":
            from services.ai.claude_provider import ClaudeProvider
            provider = ClaudeProvider(api_key=body.api_key, model=body.model or "claude-haiku-4-5")
        else:
            return {"ok": False, "message": f"Can't test provider '{body.provider}' server-side."}
        reply = provider.chat("Reply with exactly: ok", as_json=False)
        return {"ok": True, "message": f"Connected — model replied: {reply.strip()[:60]}"}
    except Exception as e:
        log.info("AI key test failed for %s: %s", body.provider, e)
        return {"ok": False, "message": str(e)[:300]}
