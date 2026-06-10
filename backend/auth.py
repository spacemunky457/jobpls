"""
Auth: password hashing + JWT issue/verify + the `get_current_user` dependency.

Pluggable by AUTH_MODE:
  - dev      -> we both issue and verify HS256 JWTs signed with settings.JWT_SECRET.
  - supabase -> we only verify Supabase-issued JWTs (HS256 shared secret, or RS256/ES256
                via JWKS). Token `sub` is the user id; we auto-provision a local User row.

The rest of the app only depends on `get_current_user`, so swapping modes never touches
business logic.
"""

import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User
from settings import settings

bearer = HTTPBearer(auto_error=True)

# Cache JWKS clients per URL (supabase mode).
_jwk_clients: dict[str, "jwt.PyJWKClient"] = {}


# --- passwords ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# --- tokens ---
def create_access_token(user: User) -> str:
    now = int(time.time())
    payload = {
        "sub": user.id,
        "email": user.email,
        "iat": now,
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def _decode_token(token: str) -> dict:
    """Verify a JWT according to AUTH_MODE and return its claims."""
    if settings.AUTH_MODE == "supabase":
        if settings.SUPABASE_JWKS_URL:
            client = _jwk_clients.get(settings.SUPABASE_JWKS_URL)
            if client is None:
                client = jwt.PyJWKClient(settings.SUPABASE_JWKS_URL)
                _jwk_clients[settings.SUPABASE_JWKS_URL] = client
            signing_key = client.get_signing_key_from_jwt(token).key
            return jwt.decode(token, signing_key, algorithms=["RS256", "ES256"], audience="authenticated")
        secret = settings.SUPABASE_JWT_SECRET or settings.JWT_SECRET
        return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
    # dev mode
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])


# --- dependency ---
def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        claims = _decode_token(creds.credentials)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        # Supabase identity we haven't seen yet -> auto-provision + seed defaults.
        from routers.seed import seed_user
        user = User(id=user_id, email=claims.get("email", ""), password_hash=None)
        db.add(user)
        db.commit()
        seed_user(db, user.id, user.email)
    return user
