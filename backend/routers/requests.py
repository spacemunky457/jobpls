from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import InputRequest, Job, User
from schemas import InputRequestOut, PublicRequestOut, RespondRequest
from services import notify

router = APIRouter(tags=["requests"])


class CreateRequest(BaseModel):
    type: str           # add_info | tailor_cv | approve
    job_id: int | None = None
    prompt: str = "Please provide the requested information."


# --- Authenticated: in-app "Needs your input" queue ---
@router.get("/requests", response_model=list[InputRequestOut])
def list_requests(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(InputRequest)
        .filter(InputRequest.user_id == current_user.id, InputRequest.status == "pending")
        .order_by(InputRequest.created_at.desc())
        .all()
    )


@router.post("/requests", response_model=InputRequestOut)
def create_request(
    body: CreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = None
    if body.job_id is not None:
        job = db.query(Job).filter(Job.id == body.job_id, Job.user_id == current_user.id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
    return notify.create_request(db, current_user, body.type, body.prompt, job)


@router.post("/requests/digest")
def send_digest(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from routers.config import get_config_dict
    config = get_config_dict(db, current_user.id)
    try:
        count = notify.send_digest(db, current_user, config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not send digest: {e}")
    return {"sent": count}


@router.post("/requests/test-email")
def test_email(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Verify the user's email setup by sending a test to their alert address
    (the DIGEST_EMAIL override if set, else their account email)."""
    from routers.config import get_config_dict
    from services.email.base import get_sender
    config = get_config_dict(db, current_user.id)
    to = notify.recipient_for(current_user, config)
    if not to:
        raise HTTPException(status_code=400, detail="No alert email set. Add one in Settings → Email.")
    html = (
        '<div style="font-family:Arial"><h2>Jobpls email works ✅</h2>'
        "<p>This is a test from your job-alert agent. Digests will arrive here.</p></div>"
    )
    try:
        get_sender(config).send(to, "Jobpls — test email", html)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Send failed: {e}")
    return {"ok": True, "to": to}


# --- Public: magic-link respond (token IS the auth; works without login) ---
def _get_by_token(db: Session, token: str) -> InputRequest:
    req = db.query(InputRequest).filter(InputRequest.token == token).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or expired")
    return req


@router.get("/public/respond/{token}", response_model=PublicRequestOut)
def view_request(token: str, db: Session = Depends(get_db)):
    req = _get_by_token(db, token)
    job = db.query(Job).filter(Job.id == req.job_id).first() if req.job_id else None
    return PublicRequestOut(
        type=req.type,
        prompt=req.prompt,
        status=req.status,
        job_title=job.title if job else None,
        job_company=job.company if job else None,
    )


@router.post("/public/respond/{token}")
def respond(token: str, body: RespondRequest, db: Session = Depends(get_db)):
    req = _get_by_token(db, token)
    if req.status == "answered":
        return {"ok": True, "message": "Already answered."}

    req.response = body.response
    req.status = "answered"
    req.answered_at = datetime.utcnow()

    # Downstream actions
    job = db.query(Job).filter(Job.id == req.job_id).first() if req.job_id else None
    if job and req.type in ("approve", "tailor_cv", "add_info"):
        job.approved = True  # enters the tailoring flow; add_info is injected at tailor time
    db.commit()
    return {"ok": True, "message": "Thanks — saved."}
