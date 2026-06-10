"""Auto-apply endpoints: one-click (single job) + batch (all eligible).

Apply runs the browser bot locally (the only generic, keyless way to submit). The
endpoint is synchronous — the browser drive can take a while per job — and only
marks a job 'applied' on a confirmed submission. See services/apply/."""

import logging

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import ApplyAttempt, Job, User
from routers.config import get_config_dict
from schemas import ApplyBatchResult, ApplyResult
from services.apply import dispatcher

log = logging.getLogger(__name__)
router = APIRouter(prefix="/apply", tags=["apply"])


def _owned(db: Session, job_id: int, user_id: str) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}", response_model=ApplyResult)
def apply_one(
    job_id: int,
    headless: Optional[bool] = Query(None),     # false = "Apply (watch it)" — visible browser
    autosubmit: Optional[bool] = Query(None),   # false = fill the form and pause
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _owned(db, job_id, current_user.id)
    config = get_config_dict(db, current_user.id)
    out = dispatcher.run_apply(db, current_user.id, job, config, headless=headless, autosubmit=autosubmit)
    return ApplyResult(job_id=job_id, method=out.method, state=out.state, detail=out.detail, trace=out.trace)


@router.post("/batch", response_model=ApplyBatchResult)
def apply_all(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = get_config_dict(db, current_user.id)
    outcomes = dispatcher.apply_batch(db, current_user.id, config)
    results = [ApplyResult(job_id=0, method=o.method, state=o.state, detail=o.detail, trace=o.trace) for o in outcomes]
    return ApplyBatchResult(
        submitted=sum(1 for o in outcomes if o.state == "submitted"),
        failed=sum(1 for o in outcomes if o.state == "failed"),
        skipped=sum(1 for o in outcomes if o.state == "skipped"),
        results=results,
    )


@router.get("/{job_id}/attempts", response_model=list[ApplyResult])
def list_attempts(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(ApplyAttempt)
        .filter(ApplyAttempt.user_id == current_user.id, ApplyAttempt.job_id == job_id)
        .order_by(ApplyAttempt.created_at.desc())
        .all()
    )
    return [ApplyResult(job_id=job_id, method=r.method, state=r.state, detail=r.detail or "") for r in rows]
