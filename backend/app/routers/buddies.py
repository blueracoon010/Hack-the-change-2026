"""Go-together preferences and audience-filtered availability. No location data."""
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from ..db import get_session
from ..models import BuddyPreference, Follow, User
from ..events.models import Event, EventRsvp, utcnow
from ..events.router import can_see, visible_to
from ..security import get_current_user

router = APIRouter(prefix='/api/buddies', tags=['buddies'])

class BuddySettings(BaseModel):
    mode: Literal['off', 'any', 'selected'] = 'selected'
    audience: Literal['everyone', 'mutual', 'selected'] = 'mutual'
    event_ids: list[int] = Field(default_factory=list, max_length=500)
    people_ids: list[int] = Field(default_factory=list, max_length=500)

def preference(user_id: int, session: Session) -> BuddySettings:
    row = session.get(BuddyPreference, user_id)
    settings = BuddySettings(mode=row.mode, audience=row.audience, event_ids=json.loads(row.event_ids_json), people_ids=json.loads(row.people_ids_json)) if row else BuddySettings()
    # Include existing event-level buddy requests, but an explicit Off always wins.
    if settings.mode == 'selected':
        requested = session.exec(select(EventRsvp.event_id).where(EventRsvp.user_id == user_id, EventRsvp.looking_for_buddy == True)).all()
        settings.event_ids = sorted(set(settings.event_ids) | set(requested))
    if settings.event_ids:
        settings.event_ids = sorted(session.exec(select(Event.id).where(Event.id.in_(settings.event_ids), visible_to(user_id, session))).all())
    if settings.people_ids:
        followed = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user_id)).all())
        settings.people_ids = sorted(set(settings.people_ids) & followed)
    return settings

@router.get('/me', response_model=BuddySettings)
def get_preferences(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return preference(user.id, session)

@router.put('/me', response_model=BuddySettings)
def save_preferences(body: BuddySettings, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    event_ids = sorted(set(body.event_ids))
    people_ids = sorted(set(body.people_ids))
    valid_events = set(session.exec(select(Event.id).where(Event.id.in_(event_ids), visible_to(user.id, session))).all()) if event_ids else set()
    if set(event_ids) - valid_events:
        raise HTTPException(400, 'One or more events no longer exist. Refresh and try again.')
    followed = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user.id)).all())
    if set(people_ids) - followed:
        raise HTTPException(400, 'Selected people must be people you follow. Refresh and try again.')
    row = session.get(BuddyPreference, user.id) or BuddyPreference(user_id=user.id)
    row.mode, row.audience = body.mode, body.audience
    row.event_ids_json, row.people_ids_json = json.dumps(event_ids), json.dumps(people_ids)
    session.add(row)
    # Update existing RSVPs only: general availability never RSVPs to every event.
    for rsvp in session.exec(select(EventRsvp).where(EventRsvp.user_id == user.id)).all():
        rsvp.looking_for_buddy = body.mode == 'any' or (body.mode == 'selected' and rsvp.event_id in event_ids)
        session.add(rsvp)
    session.commit()
    return preference(user.id, session)

@router.get('/events/{event_id}')
def available_people(event_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if event is None or not can_see(event, user.id, session):
        raise HTTPException(404, 'Event not found')
    if event.start.replace(tzinfo=None) < utcnow().replace(tzinfo=None):
        return {'people': [], 'count': 0}
    settings_rows = {p.user_id: p for p in session.exec(select(BuddyPreference)).all()}
    requested = set(session.exec(select(EventRsvp.user_id).where(EventRsvp.event_id == event_id, EventRsvp.looking_for_buddy == True)).all())
    following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user.id)).all())
    followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == user.id)).all())
    people = []
    for person in session.exec(select(User).where(User.id != user.id).order_by(User.name, User.id)).all():
        if not can_see(event, person.id, session):
            continue
        row = settings_rows.get(person.id)
        mode = row.mode if row else 'selected'
        audience = row.audience if row else 'mutual'
        events = set(json.loads(row.event_ids_json)) if row else set()
        if mode == 'off' or not (mode == 'any' or event_id in events or person.id in requested):
            continue
        allowed = audience == 'everyone' or (audience == 'mutual' and person.id in following & followers)
        if audience == 'selected' and row:
            # Recheck the live follow edge, so unfollowing revokes access immediately.
            allowed = user.id in json.loads(row.people_ids_json) and person.id in followers
        if allowed:
            people.append({'id': person.id, 'name': person.name})
    return {'people': people, 'count': len(people)}
