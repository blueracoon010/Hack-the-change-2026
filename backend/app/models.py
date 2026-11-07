"""Database tables. Add new tables here (class Foo(SQLModel, table=True)) and they are created on startup."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel
from sqlalchemy import CheckConstraint


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str
    password_hash: str
    created_at: datetime = Field(default_factory=_now)


class Follow(SQLModel, table=True):
    """One directed edge per pair; the composite primary key prevents duplicates."""
    __table_args__ = (CheckConstraint("follower_id != following_id"),)
    follower_id: int = Field(foreign_key="user.id", primary_key=True)
    following_id: int = Field(foreign_key="user.id", primary_key=True, index=True)
    created_at: datetime = Field(default_factory=_now)


class SocialProfile(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    instagram: str = ''
    interests_json: str = '[]'
    discoverable: bool = False
