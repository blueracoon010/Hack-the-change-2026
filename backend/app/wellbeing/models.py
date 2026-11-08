"""Journal entries. Registered in app/db.py:init_db. Private: only the author can ever read them."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


MOODS = ("great", "good", "okay", "low", "stressed", "anxious", "grateful", "tired")


class JournalEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = ""
    body: str = ""
    mood: str | None = None  # one of MOODS
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
