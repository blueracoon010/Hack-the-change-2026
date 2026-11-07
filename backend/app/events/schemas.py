"""API shapes. EventOut matches `NexusEvent` in frontend/src/lib/nexus.ts (camelCase) plus a few extras."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

Category = Literal["tech", "social", "outdoors", "arts", "food", "sports", "family", "learning", "wellness", "volunteer"]
Vibe = Literal["introvert", "extrovert", "either"]


def to_utc(dt: datetime) -> datetime:
    """Accept aware or naive datetimes (naive = already UTC); everything is stored as aware UTC."""
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso_utc(dt: datetime | None) -> str | None:
    return to_utc(dt).isoformat().replace("+00:00", "Z") if dt else None


class EventIn(BaseModel):
    """What every source returns. lat/lon may be missing; sync geocodes the address.
    categories/vibe may be empty; sync fills them with classify.py."""

    source: str
    source_id: str
    title: str
    start: datetime
    end: datetime | None = None
    description: str | None = None
    host: str | None = None
    raw_category: str | None = None  # the source's own label, fed to classify.py
    categories: list[str] = []
    vibe: str | None = None
    languages: list[str] = ["English"]
    indoor: bool | None = None
    venue_name: str | None = None
    address: str | None = None
    lat: float | None = None
    lon: float | None = None
    url: str | None = None
    image_url: str | None = None
    price: str | None = None
    is_online: bool = False
    scanned_from: str | None = None

    @field_validator("start", "end")
    @classmethod
    def _utc(cls, v: datetime | None) -> datetime | None:
        return to_utc(v) if v else v


class LatLng(BaseModel):
    lat: float
    lng: float


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CommunityEventIn(Camel):
    """Body for POST /api/events (a scanned flyer or a user-posted event). Same field names as NexusEvent.
    Give an address, or a position (e.g. a tap on the map), or both."""

    title: str = Field(min_length=3, max_length=120)
    host: str | None = Field(default=None, max_length=120)
    categories: list[Category] = []
    vibe: Vibe | None = None
    start: datetime
    duration_min: int | None = Field(default=None, ge=5, le=60 * 24 * 7)
    venue: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=200)
    position: LatLng | None = None
    cost: str | None = Field(default=None, max_length=40)
    indoor: bool | None = None
    languages: list[str] = ["English"]
    description: str | None = Field(default=None, max_length=2000)
    scanned_from: str | None = Field(default=None, max_length=120)
    url: str | None = Field(default=None, max_length=500)

    @field_validator("start")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return to_utc(v)


class EventOut(Camel):
    # --- exactly the NexusEvent fields ---
    id: str
    title: str
    host: str
    categories: list[str]
    vibe: str
    start: str  # ISO 8601 UTC; frontend does new Date(start)
    duration_min: int
    venue: str
    address: str
    position: LatLng
    cost: str
    indoor: bool
    going: int
    looking_for_buddy: int
    languages: list[str]
    description: str
    scanned_from: str
    # --- extras ---
    source: str  # ticketmaster | meetup | community
    end: str | None
    url: str | None  # open this for tickets / RSVP on the source site
    image_url: str | None
    is_online: bool
    distance_km: float | None = None  # when the request passed lat & lng
    me_going: bool = False  # signed-in user has RSVP'd
    mine: bool = False  # signed-in user posted it


class RsvpIn(Camel):
    looking_for_buddy: bool = False
