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


class FollowRequest(SQLModel, table=True):
    """A pending request to follow a private account (like Instagram). Accepting it turns it into a Follow."""
    requester_id: int = Field(foreign_key="user.id", primary_key=True)
    target_id: int = Field(foreign_key="user.id", primary_key=True, index=True)
    created_at: datetime = Field(default_factory=_now)


class SocialProfile(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    instagram: str = ''
    interests_json: str = '[]'
    discoverable: bool = False  # "Public profile": others see bio, neighbourhood, interests, events, map pin
    show_instagram: bool = True  # separate choice: Instagram shown only if this is on AND the profile is public
    # "About me" (shown to other members only when discoverable is on)
    bio: str = ''
    neighbourhood: str = ''
    social_style: str = 'A little of both'


class BuddyPreference(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    mode: str = 'selected'
    audience: str = 'mutual'
    event_ids_json: str = '[]'
    people_ids_json: str = '[]'


class GroupMembership(SQLModel, table=True):
    """Community page: who joined which group (group ids are defined in routers/community.py)."""
    group_id: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True, index=True)
    joined_at: datetime = Field(default_factory=_now)


class GroupMessage(SQLModel, table=True):
    """Community page: a message in a group channel. Only members can post; any signed-in member can read."""
    id: int | None = Field(default=None, primary_key=True)
    group_id: str = Field(index=True)
    channel: str = Field(index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    text: str
    created_at: datetime = Field(default_factory=_now, index=True)


class InviteCode(SQLModel, table=True):
    """Invite-a-friend: a short code (and link) that lets someone become your friend (mutual follow) in one step."""
    code: str = Field(primary_key=True)  # e.g. "K7M2QX9P"
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=_now)
    expires_at: datetime
    revoked: bool = False
