"""Badges for showing up. Upload a photo from an event you went to; each check-in counts toward badges.

Design choice: no leaderboard and no streaks. Badges reward taking the first step (going alone counts),
trying new things, moving your body, and doing things *together*, so the nudge is toward connection,
not toward attending as many events as possible.

Endpoints (under /api/badges):
  GET    /me                 your badges, progress and next badge
  GET    /user/{id}          someone's earned badges (public profiles, friends, or yourself)
  GET    /checkin-options    events you RSVPed to that have started and have no photo yet
  GET    /checkins           your event photos
  POST   /checkins           {eventId?, title?, photo}
  DELETE /checkins/{id}
"""

import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select

from ..db import get_session
from ..events.models import Event, EventRsvp
from ..events.router import friend_ids
from ..models import SocialProfile, User
from ..security import get_current_user
from .models import EventCheckIn

router = APIRouter(prefix="/api/badges", tags=["badges"])

PHOTO = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")
MAX_PHOTO_CHARS = 900_000  # about 650 KB; the app resizes photos to ~150 KB before upload
ACTIVE = {"outdoors", "sports", "wellness"}

# (id, name, what it's for, icon name in lucide, goal). Order = display order.
MILESTONES = [
    ("first-step", "First step", "Went to your first event", "footprints", 1),
    ("getting-out", "Getting out there", "Went to 3 events", "sun", 3),
    ("familiar-face", "Familiar face", "Went to 5 events", "smile", 5),
    ("regular", "Community regular", "Went to 10 events", "house", 10),
    ("anchor", "Neighbourhood anchor", "Went to 20 events", "landmark", 20),
]
SPECIAL = [
    ("together", "Better together", "Went to an event with a friend", "users", 1),
    ("move", "Move together", "3 active events: outdoors, sports or wellness", "leaf", 3),
    ("curious", "Curious mind", "Tried 3 different kinds of events", "compass", 3),
    ("helping-hand", "Helping hand", "Volunteered at a community event", "heart-handshake", 1),
    ("friend-maker", "Friend maker", "Made your first friend on Nexus", "handshake", 1),
]


def _summary(session: Session, user_id: int) -> dict:
    rows = session.exec(select(EventCheckIn).where(EventCheckIn.user_id == user_id)).all()
    attended = len(rows)
    friends = friend_ids(session, user_id)
    event_ids = [r.event_id for r in rows if r.event_id]
    together = 0
    if friends and event_ids:
        together = len(set(session.exec(select(EventRsvp.event_id).where(EventRsvp.event_id.in_(event_ids), EventRsvp.user_id.in_(friends))).all())
                       | set(session.exec(select(EventCheckIn.event_id).where(EventCheckIn.event_id.in_(event_ids), EventCheckIn.user_id.in_(friends))).all()))
    cats = [set(c for c in r.categories.split(",") if c) for r in rows]
    progress = {
        "together": together,
        "move": sum(1 for c in cats if c & ACTIVE),
        "curious": len(set().union(*cats)) if cats else 0,
        "helping-hand": sum(1 for c in cats if "volunteer" in c),
        "friend-maker": len(friends),
    }
    badges = []
    for bid, name, desc, icon, goal in MILESTONES:
        badges.append({"id": bid, "name": name, "description": desc, "icon": icon, "goal": goal,
                       "progress": min(attended, goal), "earned": attended >= goal, "kind": "milestone"})
    for bid, name, desc, icon, goal in SPECIAL:
        badges.append({"id": bid, "name": name, "description": desc, "icon": icon, "goal": goal,
                       "progress": min(progress[bid], goal), "earned": progress[bid] >= goal, "kind": "connection"})
    upcoming = [b for b in badges if not b["earned"] and b["kind"] == "milestone"]
    nxt = upcoming[0] if upcoming else None
    return {"attended": attended, "earned": sum(b["earned"] for b in badges), "total": len(badges), "badges": badges,
            "next": {"name": nxt["name"], "remaining": nxt["goal"] - attended, "icon": nxt["icon"]} if nxt else None}


@router.get("/me")
def my_badges(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    return _summary(session, user.id)


@router.get("/user/{person_id}")
def person_badges(person_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if session.get(User, person_id) is None:
        raise HTTPException(404, "User not found")
    profile = session.get(SocialProfile, person_id)
    if person_id != user.id and not (profile and profile.discoverable) and person_id not in friend_ids(session, user.id):
        return {"private": True, "earned": 0, "attended": 0, "badges": []}
    s = _summary(session, person_id)
    return {"private": False, "earned": s["earned"], "attended": s["attended"], "badges": [b for b in s["badges"] if b["earned"]]}


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


@router.get("/checkin-options")
def checkin_options(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    now = datetime.now(timezone.utc)
    done = set(session.exec(select(EventCheckIn.event_id).where(EventCheckIn.user_id == user.id)).all())
    rows = session.exec(select(Event).join(EventRsvp, EventRsvp.event_id == Event.id)
                        .where(EventRsvp.user_id == user.id, Event.start <= now + timedelta(minutes=30), Event.start >= now - timedelta(days=60))
                        .order_by(Event.start.desc())).all()
    return [{"id": str(e.id), "title": e.title, "start": _utc(e.start).isoformat().replace("+00:00", "Z"), "venue": e.venue_name or e.address or ""}
            for e in rows if e.id not in done]


class CheckInIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    event_id: int | None = None
    title: str = Field("", max_length=120)
    photo: str = Field(max_length=MAX_PHOTO_CHARS)


def _out(c: EventCheckIn) -> dict:
    return {"id": c.id, "eventId": str(c.event_id) if c.event_id else None, "title": c.title, "categories": [x for x in c.categories.split(",") if x],
            "attendedAt": _utc(c.attended_at).isoformat().replace("+00:00", "Z"), "photo": c.photo}


@router.get("/checkins")
def my_checkins(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    rows = session.exec(select(EventCheckIn).where(EventCheckIn.user_id == user.id).order_by(EventCheckIn.attended_at.desc(), EventCheckIn.id.desc())).all()
    return [_out(c) for c in rows]


@router.post("/checkins", status_code=201)
def add_checkin(body: CheckInIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if not PHOTO.match(body.photo):
        raise HTTPException(422, "Add a photo (JPG, PNG or WebP) from the event.")
    now = datetime.now(timezone.utc)
    if body.event_id is not None:
        event = session.get(Event, body.event_id)
        if event is None:
            raise HTTPException(404, "Event not found")
        if session.get(EventRsvp, (event.id, user.id)) is None:
            raise HTTPException(400, "RSVP to the event first, then add your photo after you go.")
        if _utc(event.start) > now + timedelta(minutes=30):
            raise HTTPException(400, "This event hasn't started yet. Add your photo once you're there.")
        c = EventCheckIn(user_id=user.id, event_id=event.id, title=event.title, categories=event.categories, attended_at=_utc(event.start), photo=body.photo)
    else:
        if len(body.title.strip()) < 3:
            raise HTTPException(422, "Name the event you went to.")
        recent = session.exec(select(EventCheckIn.id).where(EventCheckIn.user_id == user.id, EventCheckIn.event_id == None,  # noqa: E711
                                                            EventCheckIn.created_at >= now - timedelta(days=1))).all()
        if len(recent) >= 3:
            raise HTTPException(429, "You can add up to 3 off-app events a day.")
        c = EventCheckIn(user_id=user.id, title=body.title.strip(), attended_at=now, photo=body.photo)
    before = {b["id"] for b in _summary(session, user.id)["badges"] if b["earned"]}
    session.add(c)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "You already added a photo for this event.")
    session.refresh(c)
    after = _summary(session, user.id)
    return {"checkIn": _out(c), "newBadges": [b for b in after["badges"] if b["earned"] and b["id"] not in before], "summary": after}


@router.delete("/checkins/{checkin_id}", status_code=204)
def remove_checkin(checkin_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    c = session.get(EventCheckIn, checkin_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Photo not found")
    session.delete(c)
    session.commit()
    return Response(status_code=204)


def detach_checkins(session: Session, event_ids) -> None:
    """An event is being removed: keep people's photos and badges, just unlink them from the event."""
    for c in session.exec(select(EventCheckIn).where(EventCheckIn.event_id.in_(list(event_ids)))).all():
        c.event_id = None
        session.add(c)
    session.flush()


def delete_user_badge_data(session: Session, user_id: int) -> None:
    session.exec(delete(EventCheckIn).where(EventCheckIn.user_id == user_id))


def export_user_badge_data(session: Session, user_id: int) -> list[dict]:
    return [json.loads(c.model_dump_json(exclude={"photo"})) for c in session.exec(select(EventCheckIn).where(EventCheckIn.user_id == user_id))]
