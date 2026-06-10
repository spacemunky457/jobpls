"""Applicant profile: the real personal details auto-apply submits to forms.
One row per user, created at signup (see routers/seed.py)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import ApplicantProfile, User
from schemas import ApplicantProfileOut, ApplicantProfileUpdate

router = APIRouter(prefix="/applicant", tags=["applicant"])


def _get_or_create(db: Session, user_id: str, email: str = "") -> ApplicantProfile:
    profile = db.query(ApplicantProfile).filter(ApplicantProfile.user_id == user_id).first()
    if not profile:
        profile = ApplicantProfile(user_id=user_id, email=email or "")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("", response_model=ApplicantProfileOut)
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_or_create(db, current_user.id, current_user.email)


@router.put("", response_model=ApplicantProfileOut)
def update_profile(
    body: ApplicantProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create(db, current_user.id, current_user.email)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile
