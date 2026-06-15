"""Automation tile API: settings (frequency/digest), readiness checklist,
manual run-now trigger, and pollable run progress."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Run, User
from routers.config import get_config_dict
from routers.setup import SERVER_PROVIDERS, _ai_state, _email_state
from schemas import RunOut
from services import automation

router = APIRouter(prefix="/automation", tags=["automation"])


class AutomationUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_hours: Optional[float] = None
    digest_mode: Optional[str] = None    # after_run | daily
    digest_time: Optional[str] = None    # HH:MM (UTC)
    digest_min_tier: Optional[str] = None


def _state(db: Session, user: User) -> dict:
    config = get_config_dict(db, user.id)
    provider = config.get("AI_PROVIDER", "ollama_browser")
    ai_ok, ai_summary = _ai_state(config)
    email_ok, email_summary = _email_state(config)
    from routers.cv import get_default_cv_text
    cv_ok = len(get_default_cv_text(db, user.id).strip()) > 100

    enabled = config.get("AUTOMATION_ENABLED", "false") == "true"
    try:
        interval = float(config.get("AUTOMATION_INTERVAL_HOURS", "6") or 6)
    except ValueError:
        interval = 6.0

    last = automation.latest_run(db, user.id)
    last_auto = automation.latest_run(db, user.id, kind="auto")
    running = automation.is_running(db, user.id)
    next_run_at = None
    if enabled:
        base = last_auto.started_at if last_auto else datetime.utcnow()
        next_run_at = (base + timedelta(hours=interval)) if last_auto else datetime.utcnow()

    return {
        "enabled": enabled,
        "interval_hours": interval,
        "digest_mode": config.get("DIGEST_MODE", "after_run"),
        "digest_time": config.get("DIGEST_TIME", "09:00"),
        "digest_min_tier": config.get("DIGEST_MIN_TIER", "possible"),
        "running": running,
        "next_run_at": next_run_at,
        "last_run": RunOut.model_validate(last) if last else None,
        "ready": {
            "ai_server": provider in SERVER_PROVIDERS and ai_ok,
            "ai_summary": ai_summary,
            "email": email_ok,
            "email_summary": email_summary,
            "cv": cv_ok,
        },
    }


@router.get("")
def get_automation(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _state(db, current_user)


@router.put("")
def update_automation(
    body: AutomationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import Config

    updates: dict[str, str] = {}
    if body.enabled is not None:
        updates["AUTOMATION_ENABLED"] = "true" if body.enabled else "false"
    if body.interval_hours is not None:
        updates["AUTOMATION_INTERVAL_HOURS"] = str(body.interval_hours)
    if body.digest_mode in ("after_run", "daily"):
        updates["DIGEST_MODE"] = body.digest_mode
    if body.digest_time is not None:
        updates["DIGEST_TIME"] = body.digest_time
    if body.digest_min_tier in ("perfect", "strong", "possible", "stretch"):
        updates["DIGEST_MIN_TIER"] = body.digest_min_tier

    for key, value in updates.items():
        row = db.query(Config).filter(Config.user_id == current_user.id, Config.key == key).first()
        if row:
            row.value = value
        else:
            db.add(Config(user_id=current_user.id, key=key, value=value))
    db.commit()
    return _state(db, current_user)


@router.post("/run-now")
def run_now(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if automation.is_running(db, current_user.id):
        raise HTTPException(status_code=409, detail="A run is already in progress.")
    run = automation.start_run(db, current_user.id, kind="manual")
    return {"run_id": run.id}


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = db.query(Run).filter(Run.id == run_id, Run.user_id == current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
