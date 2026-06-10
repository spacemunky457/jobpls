import io
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from auth import get_current_user
from database import get_db
from models import MasterCV, User
from schemas import MasterCVCreate, MasterCVOut, MasterCVUpdate

router = APIRouter(prefix="/cv", tags=["cv"])


def _get_owned(db: Session, cv_id: int, user_id: str) -> MasterCV:
    cv = db.query(MasterCV).filter(MasterCV.id == cv_id, MasterCV.user_id == user_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    return cv


def _clear_defaults(db: Session, user_id: str):
    for row in db.query(MasterCV).filter(MasterCV.user_id == user_id, MasterCV.is_default == True).all():
        row.is_default = False


def get_default_cv_text(db: Session, user_id: str) -> str:
    cv = (
        db.query(MasterCV)
        .filter(MasterCV.user_id == user_id, MasterCV.is_default == True)
        .first()
    )
    if not cv:
        cv = db.query(MasterCV).filter(MasterCV.user_id == user_id).order_by(MasterCV.id).first()
    return cv.content if cv else ""


@router.get("", response_model=list[MasterCVOut])
def list_cvs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(MasterCV)
        .filter(MasterCV.user_id == current_user.id)
        .order_by(MasterCV.is_default.desc(), MasterCV.id)
        .all()
    )


@router.post("", response_model=MasterCVOut)
def create_cv(
    body: MasterCVCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    first = db.query(MasterCV).filter(MasterCV.user_id == current_user.id).count() == 0
    cv = MasterCV(user_id=current_user.id, name=body.name, content=body.content, is_default=first)
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.post("/upload", response_model=MasterCVOut)
async def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contents = await file.read()
    filename = file.filename or ""
    if filename.lower().endswith(".pdf"):
        text = _extract_pdf(contents)
    elif filename.lower().endswith(".txt"):
        text = contents.decode("utf-8", errors="replace")
    else:
        raise HTTPException(status_code=400, detail="Only PDF or .txt files are supported")

    first = db.query(MasterCV).filter(MasterCV.user_id == current_user.id).count() == 0
    cv = MasterCV(user_id=current_user.id, name=filename or "Uploaded CV", content=text.strip(), is_default=first)
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.put("/{cv_id}", response_model=MasterCVOut)
def update_cv(
    cv_id: int,
    body: MasterCVUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = _get_owned(db, cv_id, current_user.id)
    if body.name is not None:
        cv.name = body.name
    if body.content is not None:
        cv.content = body.content
    db.commit()
    db.refresh(cv)
    return cv


@router.post("/{cv_id}/default", response_model=MasterCVOut)
def set_default(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = _get_owned(db, cv_id, current_user.id)
    _clear_defaults(db, current_user.id)
    cv.is_default = True
    db.commit()
    db.refresh(cv)
    return cv


@router.delete("/{cv_id}")
def delete_cv(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = _get_owned(db, cv_id, current_user.id)
    was_default = cv.is_default
    db.delete(cv)
    db.commit()
    if was_default:
        nxt = db.query(MasterCV).filter(MasterCV.user_id == current_user.id).order_by(MasterCV.id).first()
        if nxt:
            nxt.is_default = True
            db.commit()
    return {"ok": True}


def _extract_pdf(data: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")
