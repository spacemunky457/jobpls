from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from auth import get_current_user
from database import get_db
from models import Source, User
from schemas import SourceCreate, SourceOut, SourceUpdate

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Source).filter(Source.user_id == current_user.id).order_by(Source.id).all()


@router.post("", response_model=SourceOut, status_code=201)
def create_source(
    body: SourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    src = Source(user_id=current_user.id, **body.model_dump())
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


@router.post("/seed-defaults")
def add_recommended_sources(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Add any recommended default sources the user doesn't already have. Lets
    existing accounts pick up sources added after they signed up (idempotent)."""
    from routers.seed import DEFAULT_SOURCES
    existing = {(s.type, s.query) for s in db.query(Source).filter(Source.user_id == current_user.id).all()}
    added = 0
    for stype, query in DEFAULT_SOURCES:
        if (stype, query) not in existing:
            db.add(Source(user_id=current_user.id, type=stype, query=query, enabled=True))
            added += 1
    db.commit()
    return {"added": added}


@router.patch("/{source_id}", response_model=SourceOut)
def update_source(
    source_id: int,
    body: SourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    src = db.query(Source).filter(Source.id == source_id, Source.user_id == current_user.id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Source not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(src, field, value)
    db.commit()
    db.refresh(src)
    return src


@router.delete("/{source_id}")
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    src = db.query(Source).filter(Source.id == source_id, Source.user_id == current_user.id).first()
    if src:
        db.delete(src)
        db.commit()
    return {"deleted": source_id}
