"""Event check-ins: a photo from an event you went to. Each one counts toward your badges.

Registered in app/db.py:init_db. Photos are small JPEGs (resized in the browser) stored as data URLs so they
work on every teammate's laptop through the shared database without a file server.
"""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel, UniqueConstraint


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EventCheckIn(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "event_id"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    event_id: int | None = Field(default=None, foreign_key="event.id", index=True)  # None = an event not on Nexus
    title: str
    categories: str = ""  # copied from the event, comma separated
    attended_at: datetime  # UTC, when the event started
    photo: str  # data:image/jpeg;base64,...
    created_at: datetime = Field(default_factory=utcnow)
