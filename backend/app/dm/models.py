"""Direct messages between friends (mutual follows). Registered in app/db.py:init_db."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DirectMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    sender_id: int = Field(foreign_key="user.id", index=True)
    recipient_id: int = Field(foreign_key="user.id", index=True)
    text: str
    created_at: datetime = Field(default_factory=utcnow, index=True)
    read_at: datetime | None = None
