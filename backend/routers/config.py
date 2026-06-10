from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from auth import get_current_user
from database import get_db
from models import Config, User
from routers.seed import DEFAULT_CONFIG
from schemas import ConfigUpdate

router = APIRouter(prefix="/config", tags=["config"])


def get_config_dict(db: Session, user_id: str) -> dict:
    rows = db.query(Config).filter(Config.user_id == user_id).all()
    result = dict(DEFAULT_CONFIG)
    for row in rows:
        result[row.key] = row.value
    return result


@router.get("")
def read_config(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_config_dict(db, current_user.id)


@router.put("")
def update_config(
    body: ConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for key, value in body.updates.items():
        row = (
            db.query(Config)
            .filter(Config.user_id == current_user.id, Config.key == key)
            .first()
        )
        if row:
            row.value = value
        else:
            db.add(Config(user_id=current_user.id, key=key, value=value))
    db.commit()
    return get_config_dict(db, current_user.id)
