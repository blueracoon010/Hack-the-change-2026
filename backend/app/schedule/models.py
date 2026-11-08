"""Tables for "Plan with friends". Registered in app/db.py:init_db.

Privacy: friends only ever see *when* you are busy, never what you are doing. Imported calendars keep
start/end times only; event titles from Google Calendar are never stored.
"""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# busy kinds all block time; "open" marks a window you'd actively like to make plans in.
KINDS = ("busy", "work", "class", "me_time", "open")


class BusyBlock(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    start: datetime = Field(index=True)  # UTC
    end: datetime  # UTC
    kind: str = "busy"  # one of KINDS
    label: str = ""  # private note, shown only to the owner
    repeat_weekly: bool = False  # e.g. work Mon 9-5 every week
    source: str = Field(default="manual", index=True)  # "manual" | "calendar" (imported from Google / iCal)
    created_at: datetime = Field(default_factory=utcnow)


class CalendarFeed(SQLModel, table=True):
    """A linked Google Calendar (its private iCal address), re-read on demand to refresh busy times."""

    user_id: int = Field(foreign_key="user.id", primary_key=True)
    url: str
    last_synced: datetime | None = None
    last_error: str | None = None
    busy_count: int = 0


class ScheduleSettings(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    share_with_friends: bool = True  # friends = mutual follows; nobody else ever sees your schedule
