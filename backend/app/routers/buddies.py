"""Go-together preferences and audience-filtered availability. No location data."""
import json
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from ..db import get_session
from ..models import BuddyPreference, Follow, User
from ..events.models import BuddyPair, Event, EventRsvp, utcnow
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

class _Viewer:
    """Follow edges of the person looking at buddy availability."""
    def __init__(self, user_id: int, session: Session):
        self.id = user_id
        self.following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user_id)).all())
        self.followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == user_id)).all())
        self.friends = self.following & self.followers

    def may_see_name(self, person_id: int, row: BuddyPreference | None) -> bool:
        """The person's "who can see you're open" setting, rechecked against live follows."""
        audience = row.audience if row else 'mutual'
        if audience == 'everyone':
            return True
        if audience == 'mutual':
            return person_id in self.friends
        # selected: they picked you, and they still follow you
        return bool(row) and self.id in json.loads(row.people_ids_json) and person_id in self.followers


def _is_open(row: BuddyPreference | None, person_id: int, event_id: int, requested: set[int]) -> bool:
    mode = row.mode if row else 'selected'
    if mode == 'off':
        return False
    return mode == 'any' or person_id in requested or (row is not None and event_id in json.loads(row.event_ids_json))


def _upcoming(event: Event) -> bool:
    return (event.end or event.start).replace(tzinfo=None) >= utcnow().replace(tzinfo=None)


def _event_buddies(event: Event, user: User, session: Session) -> dict:
    """Who is open to company at this event, from the viewer's side.
    Friends (mutual follows) are named; anyone else is only ever a count."""
    event_id = event.id
    if not _upcoming(event):
        return {'people': [], 'count': 0, 'friends': [], 'others': 0, 'companions': []}
    viewer = _Viewer(user.id, session)
    prefs = {p.user_id: p for p in session.exec(select(BuddyPreference)).all()}
    requested = set(session.exec(select(EventRsvp.user_id).where(EventRsvp.event_id == event_id, EventRsvp.looking_for_buddy == True)).all())
    pairs = session.exec(select(BuddyPair).where(BuddyPair.event_id == event_id)).all()
    going_with = {p.requester_id for p in pairs if p.companion_id == user.id}
    named, friends = [], []
    for person in session.exec(select(User).where(User.id != user.id).order_by(User.name, User.id)).all():
        row = prefs.get(person.id)
        if not _is_open(row, person.id, event_id, requested) or not can_see(event, person.id, session):
            continue
        if not viewer.may_see_name(person.id, row):
            continue
        named.append({'id': person.id, 'name': person.name})
        if person.id in viewer.friends:
            friends.append({'id': person.id, 'name': person.name, 'asked': person.id in requested, 'withMe': person.id in going_with})
    friend_ids_ = {f['id'] for f in friends}
    others = len(requested - friend_ids_ - {user.id})
    companion_ids = [p.companion_id for p in pairs if p.requester_id == user.id]
    companions = [{'id': u.id, 'name': u.name} for u in session.exec(select(User).where(User.id.in_(companion_ids)).order_by(User.name)).all()] if companion_ids else []
    return {'people': named, 'count': len(named), 'friends': friends, 'others': others, 'companions': companions}


def _visible_event(event_id: int, user: User, session: Session) -> Event:
    event = session.get(Event, event_id)
    if event is None or not can_see(event, user.id, session):
        raise HTTPException(404, 'Event not found')
    return event


@router.get('/events/{event_id}')
def available_people(event_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return _event_buddies(_visible_event(event_id, user, session), user, session)


@router.post('/events/{event_id}/go-with/{person_id}')
def go_with(event_id: int, person_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """ "I'll go with you": RSVPs you to the event and tells the friend who asked."""
    event = _visible_event(event_id, user, session)
    if not _upcoming(event):
        raise HTTPException(400, 'This event has already happened.')
    if not any(f['id'] == person_id for f in _event_buddies(event, user, session)['friends']):
        raise HTTPException(404, "That friend isn't looking for company at this event.")
    if session.get(EventRsvp, (event_id, user.id)) is None:
        session.add(EventRsvp(event_id=event_id, user_id=user.id))
    if session.get(BuddyPair, (event_id, person_id, user.id)) is None:
        session.add(BuddyPair(event_id=event_id, requester_id=person_id, companion_id=user.id))
    session.commit()
    return _event_buddies(event, user, session)


@router.delete('/events/{event_id}/go-with/{person_id}')
def stop_going_with(event_id: int, person_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    event = _visible_event(event_id, user, session)
    pair = session.get(BuddyPair, (event_id, person_id, user.id))
    if pair:
        session.delete(pair)
        session.commit()
    return _event_buddies(event, user, session)


@router.get('/wanted')
def wanted(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """For the map's "Wants company" filter: upcoming events where someone asked for a buddy.
    Friends who asked are named (so their avatar can sit on the pin); everyone else is a count."""
    viewer = _Viewer(user.id, session)
    prefs = {p.user_id: p for p in session.exec(select(BuddyPreference)).all()}
    rows = session.exec(
        select(EventRsvp.event_id, EventRsvp.user_id)
        .join(Event, Event.id == EventRsvp.event_id)
        .where(EventRsvp.looking_for_buddy == True, EventRsvp.user_id != user.id,
               Event.start >= utcnow() - timedelta(hours=12), visible_to(user.id, session))
    ).all()
    names = {u.id: u.name for u in session.exec(select(User).where(User.id.in_({uid for _, uid in rows}))).all()} if rows else {}
    out: dict[int, dict] = {}
    for event_id, person_id in rows:
        entry = out.setdefault(event_id, {'eventId': str(event_id), 'friends': [], 'others': 0})
        row = prefs.get(person_id)
        if row and row.mode == 'off':
            continue
        if person_id in viewer.friends and viewer.may_see_name(person_id, row):
            entry['friends'].append({'id': person_id, 'name': names.get(person_id, '')})
        else:
            entry['others'] += 1
    return [e for e in out.values() if e['friends'] or e['others']]
