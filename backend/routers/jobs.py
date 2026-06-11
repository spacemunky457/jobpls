from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from auth import get_current_user
from database import get_db
from models import Application, Job, User
from schemas import ApplicationOut, ApplicationUpdate, JobApprove, JobBatchApprove, JobOut, JobStatusUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get_owned(db: Session, job_id: int, user_id: str) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("", response_model=list[JobOut])
def list_jobs(
    status: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    eligibility: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    approved_only: bool = False,
    limit: int = Query(200, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Job).filter(Job.user_id == current_user.id)
    if status:
        q = q.filter(Job.status.in_(status.split(",")))
    if tier:
        q = q.filter(Job.tier.in_(tier.split(",")))
    if eligibility:
        q = q.filter(Job.eligibility.in_(eligibility.split(",")))
    if search:
        like = f"%{search}%"
        q = q.filter(Job.title.ilike(like) | Job.company.ilike(like))
    if approved_only:
        q = q.filter(Job.approved == True)
    return q.order_by(Job.added_at.desc()).offset(offset).limit(limit).all()


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    base = db.query(Job).filter(Job.user_id == current_user.id)
    return {
        "total": base.count(),
        "new": base.filter(Job.status == "new").count(),
        "assessed": base.filter(Job.status == "assessed").count(),
        "approved": base.filter(Job.approved == True).count(),
        "drafted": base.filter(Job.status == "drafted").count(),
        "applied": base.filter(Job.status == "applied").count(),
        "passed": base.filter(Job.status == "passed").count(),
        # Human queue: assessed but neither shortlisted nor passed.
        "to_review": base.filter(Job.status == "assessed", Job.approved == False).count(),
    }


# Declared before /{job_id} routes so "batch" isn't parsed as a job id.
@router.patch("/batch/approve")
def set_approval_batch(
    body: JobBatchApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated = (
        db.query(Job)
        .filter(Job.id.in_(body.ids), Job.user_id == current_user.id)
        .update({Job.approved: body.approved}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated, "approved": body.approved}


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_owned(db, job_id, current_user.id)


@router.patch("/{job_id}/approve")
def set_approval(
    job_id: int,
    body: JobApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_owned(db, job_id, current_user.id)
    job.approved = body.approved
    db.commit()
    return {"id": job.id, "approved": job.approved}


@router.patch("/{job_id}/status")
def set_status(
    job_id: int,
    body: JobStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_owned(db, job_id, current_user.id)
    job.status = body.status
    db.commit()
    return {"id": job.id, "status": job.status}


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = _get_owned(db, job_id, current_user.id)
    db.delete(job)
    db.commit()
    return {"deleted": job_id}


@router.get("/{job_id}/application", response_model=ApplicationOut)
def get_application(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app = (
        db.query(Application)
        .filter(Application.job_id == job_id, Application.user_id == current_user.id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="No application for this job")
    return app


@router.put("/{job_id}/application", response_model=ApplicationOut)
def update_application(
    job_id: int,
    body: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = (
        db.query(Application)
        .filter(Application.job_id == job_id, Application.user_id == current_user.id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="No application for this job")
    if body.cv_text is not None:
        app.cv_text = body.cv_text
    if body.email_draft is not None:
        app.email_draft = body.email_draft
    if body.notes is not None:
        app.notes = body.notes
    db.commit()
    db.refresh(app)
    return app


@router.get("/{job_id}/application/download")
def download_application(
    job_id: int,
    format: str = Query("pdf"),   # "pdf" (default) | "txt"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = (
        db.query(Application)
        .filter(Application.job_id == job_id, Application.user_id == current_user.id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="No application for this job")
    job = _get_owned(db, job_id, current_user.id)
    safe = "".join(c for c in f"{job.company}_{job.title}" if c.isalnum() or c in " _-")[:50]
    from services.tailoring import clean_text
    text = clean_text(app.cv_text or "")
    if format.lower() == "txt":
        return Response(
            content=text,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="CV_{safe}.txt"'},
        )
    from services.pdf import cv_text_to_pdf
    return Response(
        content=cv_text_to_pdf(text),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CV_{safe}.pdf"'},
    )
