from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from auth import get_current_user
from database import get_db
from models import TailoringProfile, User
from schemas import TailoringProfileCreate, TailoringProfileOut, TailoringProfileUpdate

router = APIRouter(prefix="/tailoring-profiles", tags=["tailoring"])


def _get_owned(db: Session, profile_id: int, user_id: str) -> TailoringProfile:
    p = (
        db.query(TailoringProfile)
        .filter(TailoringProfile.id == profile_id, TailoringProfile.user_id == user_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    return p


def get_default_profile_options(db: Session, user_id: str) -> dict:
    p = (
        db.query(TailoringProfile)
        .filter(TailoringProfile.user_id == user_id, TailoringProfile.is_default == True)
        .first()
    )
    if not p:
        p = db.query(TailoringProfile).filter(TailoringProfile.user_id == user_id).order_by(TailoringProfile.id).first()
    return (p.options or {}) if p else {}


@router.get("", response_model=list[TailoringProfileOut])
def list_profiles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(TailoringProfile)
        .filter(TailoringProfile.user_id == current_user.id)
        .order_by(TailoringProfile.is_default.desc(), TailoringProfile.id)
        .all()
    )


@router.post("", response_model=TailoringProfileOut)
def create_profile(
    body: TailoringProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    first = db.query(TailoringProfile).filter(TailoringProfile.user_id == current_user.id).count() == 0
    p = TailoringProfile(user_id=current_user.id, name=body.name, options=body.options, is_default=first)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{profile_id}", response_model=TailoringProfileOut)
def update_profile(
    profile_id: int,
    body: TailoringProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_owned(db, profile_id, current_user.id)
    if body.name is not None:
        p.name = body.name
    if body.options is not None:
        p.options = body.options
    db.commit()
    db.refresh(p)
    return p


@router.post("/{profile_id}/default", response_model=TailoringProfileOut)
def set_default(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_owned(db, profile_id, current_user.id)
    for row in (
        db.query(TailoringProfile)
        .filter(TailoringProfile.user_id == current_user.id, TailoringProfile.is_default == True)
        .all()
    ):
        row.is_default = False
    p.is_default = True
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{profile_id}")
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _get_owned(db, profile_id, current_user.id)
    db.delete(p)
    db.commit()
    return {"ok": True}
