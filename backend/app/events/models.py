"""Tables for the events feature. Registered in app/db.py:init_db."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel, UniqueConstraint


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Event(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("source", "source_id"),)

    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)  # "ticketmaster" | "meetup" | "community"
    source_id: str  # the id on the source site, used to de-duplicate on every sync
    title: str
    description: str | None = None
    host: str | None = None  # organiser: Ticketmaster promoter, Meetup group, community association
    categories: str = ""  # comma separated, values from frontend/src/lib/nexus.ts Category (see classify.py)
    vibe: str = "either"  # introvert | extrovert | either
    languages: str = "English"  # comma separated
    indoor: bool = True
    scanned_from: str | None = None  # where it came from: "Ticketmaster", "Meetup", or the flyer location
    start: datetime = Field(index=True)  # UTC
    end: datetime | None = None  # UTC
    venue_name: str | None = None
    address: str | None = None
    lat: float | None = Field(default=None, index=True)
    lon: float | None = Field(default=None, index=True)
    url: str | None = None  # link out to the source page for tickets / RSVP
    image_url: str | None = None
    price: str | None = None  # free text, e.g. "Free" or "$25-$60 CAD"
    is_online: bool = False
    created_by: int | None = Field(default=None, foreign_key="user.id", index=True)  # community events only
    visibility: str = Field(default="public", index=True)  # "public" | "private" (private = friends only: mutual follows)
    fetched_at: datetime = Field(default_factory=utcnow)


class EventRsvp(SQLModel, table=True):
    """Real "going" and "looking for a buddy" counts, from people using the app."""

    event_id: int = Field(foreign_key="event.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    looking_for_buddy: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class GeocodeCache(SQLModel, table=True):
    """Every address we have looked up, so each one hits Nominatim only once (their usage policy requires caching)."""

    query: str = Field(primary_key=True)
    lat: float | None = None  # None = looked up and not found, don't retry
    lon: float | None = None
    looked_up_at: datetime = Field(default_factory=utcnow)


class SyncRun(SQLModel, table=True):
    """One row per source per sync, so the UI can show "updated 5 min ago" and why a source is empty."""

    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    ok: bool
    fetched: int = 0
    saved: int = 0
    skipped_no_location: int = 0
    error: str | None = None
    finished_at: datetime = Field(default_factory=utcnow)
