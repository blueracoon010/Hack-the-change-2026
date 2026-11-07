import hashlib
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from ..config import settings
from ..mailer import send_email

from ..db import get_session
from ..models import User
from ..schemas import LoginIn, SignupIn, TokenOut, UserOut
from ..security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_for(user: User) -> TokenOut:
    assert user.id is not None
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user, from_attributes=True))


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, session: Session = Depends(get_session)) -> TokenOut:
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(name=body.name, email=body.email, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token_for(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _token_for(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


# ---------- Forgot / reset password ----------
# The reset link holds a signed token (purpose "password-reset", 30 min) that also contains a fingerprint of the
# current password hash: once the password changes, the link stops working, so every link is single-use.
# get_current_user rejects these tokens, so a reset link can never be used to sign in.

class ForgotIn(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class ResetIn(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return SignupIn._password(v)  # same rules as sign up (8+ characters, bcrypt limit)


def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


_last_request: dict[str, float] = {}  # email -> time, to stop someone flooding an inbox


@router.post("/forgot-password", status_code=202)
def forgot_password(body: ForgotIn, background: BackgroundTasks, session: Session = Depends(get_session)) -> dict:
    """Always answers the same way, so nobody can use this to find out which emails have accounts."""
    generic = {"message": "If an account exists for that email, we've sent a link to reset the password. It expires in "
                          f"{settings.password_reset_minutes} minutes."}
    now = time.monotonic()
    if now - _last_request.get(body.email, -1e9) < 60:
        return generic
    _last_request[body.email] = now
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user:
        token = jwt.encode({"sub": str(user.id), "purpose": "password-reset", "ph": _fingerprint(user.password_hash),
                            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_minutes)},
                           settings.jwt_secret, algorithm="HS256")
        link = f"{settings.app_url}/#/reset-password?token={token}"
        background.add_task(send_email, user.email, "Reset your Nexus password",
                            f"Hi {user.name},\n\nSomeone (hopefully you) asked to reset your Nexus password. "
                            f"Open this link within {settings.password_reset_minutes} minutes to choose a new one:\n\n{link}\n\n"
                            "If you didn't ask for this, you can ignore this email: your password won't change.")
    return generic


@router.post("/reset-password", response_model=TokenOut)
def reset_password(body: ResetIn, session: Session = Depends(get_session)) -> TokenOut:
    invalid = HTTPException(400, "This reset link is invalid or has expired. Ask for a new one.")
    try:
        payload = jwt.decode(body.token, settings.jwt_secret, algorithms=["HS256"])
        if payload.get("purpose") != "password-reset":
            raise invalid
        user = session.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise invalid
    if user is None or payload.get("ph") != _fingerprint(user.password_hash):
        raise invalid  # account gone, or the link was already used
    user.password_hash = hash_password(body.password)
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token_for(user)  # signed straight in
