"""Authenticated social graph. Public previews expose only IDs and display names."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from ..db import get_session
from ..models import Follow, User
from ..security import get_current_user

router = APIRouter(prefix='/api/social', tags=['social'])

@router.get('/me')
def my_connections(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    outgoing = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user.id)).all())
    incoming = set(session.exec(select(Follow.follower_id).where(Follow.following_id == user.id)).all())
    people = session.exec(select(User).where(User.id != user.id).order_by(User.name, User.id)).all()
    profiles = {p.user_id: p for p in session.exec(select(SocialProfile)).all()}
    own = profiles.get(user.id)
    own_interests = set(json.loads(own.interests_json)) if own and own.discoverable else set()
    edges = session.exec(select(Follow)).all()
    previews = []
    for person in people:
        profile = profiles.get(person.id)
        shared = sorted(own_interests & set(json.loads(profile.interests_json))) if profile and profile.discoverable else []
        mutual = len({e.follower_id for e in edges if e.following_id == person.id} & outgoing)
        reasons = ([f"Shared interests: {', '.join(shared)}"] if shared else [])
        if mutual and own and own.discoverable and profile and profile.discoverable:
            reasons.append(f'{mutual} people you follow also follow this person')
        previews.append({'id': person.id, 'name': person.name,
                         'instagram': public_instagram(profile),
                         'reasons': reasons,
                         'suggested': bool(reasons) and person.id not in outgoing})
    return {
        'people': sorted(previews, key=lambda p: (not p['suggested'], p['name'].lower(), p['id'])),
        'followers': sorted(incoming), 'following': sorted(outgoing),
        'follower_count': len(incoming), 'following_count': len(outgoing),
    }

@router.put('/following/{target_id}', status_code=204)
def follow(target_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    if target_id == user.id:
        raise HTTPException(400, 'You cannot follow yourself')
    if session.get(User, target_id) is None:
        raise HTTPException(404, 'User not found')
    if session.get(Follow, (user.id, target_id)) is None:
        session.add(Follow(follower_id=user.id, following_id=target_id))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            # Concurrent duplicate requests are successful; other failures are not.
            if session.get(Follow, (user.id, target_id)) is None:
                raise
    return Response(status_code=204)

@router.delete('/following/{target_id}', status_code=204)
def unfollow(target_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    edge = session.get(Follow, (user.id, target_id))
    if edge is not None:
        session.delete(edge)
        session.commit()
    return Response(status_code=204)

# Optional social details live separately so existing user tables need no migration.
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
import jwt
from pydantic import BaseModel, Field, field_validator
from ..config import settings
from ..models import SocialProfile

INTERESTS = {'Walking & outdoors', 'Books', 'Art & culture', 'Music', 'Sports', 'Coffee & conversation'}
SOCIAL_STYLES = ('Quiet & small groups', 'A little of both', 'Lively & social')

def public_instagram(profile) -> str:
    """Instagram is its own choice: shown to others only if the profile is public AND "show Instagram" is on."""
    return profile.instagram if profile and profile.discoverable and profile.show_instagram else ''


class SocialDetails(BaseModel):
    # On a PUT, any field left out (None) keeps what's stored, so each form saves only its own settings.
    instagram: str | None = Field(default=None, max_length=31)
    show_instagram: bool | None = None
    interests: list[str] | None = Field(default=None, max_length=6)
    discoverable: bool | None = None  # public profile
    bio: str | None = Field(default=None, max_length=400)
    neighbourhood: str | None = Field(default=None, max_length=80)
    social_style: Literal['Quiet & small groups', 'A little of both', 'Lively & social'] | None = None

    @field_validator('bio', 'neighbourhood')
    @classmethod
    def tidy(cls, value):
        return value.strip() if value is not None else value

    @field_validator('instagram')
    @classmethod
    def instagram_handle(cls, value):
        if value is None:
            return value
        value = value.strip().lstrip('@').lower()
        if value and not re.fullmatch(r'[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?', value):
            raise ValueError('Enter an Instagram username, without a URL')
        if '..' in value:
            raise ValueError('Invalid Instagram username')
        return value

    @field_validator('interests')
    @classmethod
    def known_interests(cls, value):
        if value is None:
            return value
        if not set(value) <= INTERESTS:
            raise ValueError('Unknown interest')
        return sorted(set(value))

@router.get('/profile')
def get_social_profile(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    profile = session.get(SocialProfile, user.id)
    details = SocialDetails(instagram=profile.instagram, show_instagram=profile.show_instagram, interests=json.loads(profile.interests_json),
                            discoverable=profile.discoverable, bio=profile.bio, neighbourhood=profile.neighbourhood,
                            social_style=profile.social_style) if profile \
        else SocialDetails(instagram='', show_instagram=True, interests=[], discoverable=False, bio='', neighbourhood='', social_style='A little of both')
    return details.model_dump()

@router.put('/profile')
def save_social_profile(body: SocialDetails, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    profile = session.get(SocialProfile, user.id) or SocialProfile(user_id=user.id)
    if body.instagram is not None:
        profile.instagram = body.instagram
    if body.show_instagram is not None:
        profile.show_instagram = body.show_instagram
    if body.interests is not None:
        profile.interests_json = json.dumps(body.interests)
    if body.discoverable is not None:
        profile.discoverable = body.discoverable
    if body.bio is not None:
        profile.bio = body.bio
    if body.neighbourhood is not None:
        profile.neighbourhood = body.neighbourhood
    if body.social_style is not None:
        profile.social_style = body.social_style
    session.add(profile)
    session.commit()
    return get_social_profile(user, session)

# ---------- Invite a friend ----------
# A short code (also usable as a link: APP_URL/#/invite/CODE). Anyone with it can see your name and become your
# friend (you follow each other) in one tap. Works whether your profile is public or private; you can make a new
# code any time, which switches the old one off.
INVITE_DAYS = 30
_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O or 1/I, easy to read out loud


def _new_code() -> str:
    import secrets
    return ''.join(secrets.choice(_CODE_ALPHABET) for _ in range(8))


def _active_invite(session: Session, user_id: int):
    from ..models import InviteCode
    now = datetime.now(timezone.utc)
    for inv in session.exec(select(InviteCode).where(InviteCode.user_id == user_id, InviteCode.revoked == False)  # noqa: E712
                            .order_by(InviteCode.created_at.desc())).all():
        exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
        if exp > now:
            return inv
    return None


def _invite_out(inv) -> dict:
    exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
    return {'code': inv.code, 'expires_at': exp.isoformat()}


@router.get('/invites/mine')
def my_invite(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Your current invite code, created on first use."""
    from ..models import InviteCode
    inv = _active_invite(session, user.id)
    if inv is None:
        inv = InviteCode(code=_new_code(), user_id=user.id, expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS))
        session.add(inv)
        session.commit()
        session.refresh(inv)
    return _invite_out(inv)


@router.post('/invites/new')
def new_invite(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Switch off your old code (e.g. you shared it too widely) and get a fresh one."""
    from ..models import InviteCode
    for inv in session.exec(select(InviteCode).where(InviteCode.user_id == user.id, InviteCode.revoked == False)).all():  # noqa: E712
        inv.revoked = True
        session.add(inv)
    session.commit()
    return my_invite(user, session)


def _inviter(code: str, session: Session) -> User:
    from ..models import InviteCode
    gone = HTTPException(404, 'This invite is invalid or has expired. Ask your friend for a new one.')
    code = code.strip().upper().replace('-', '').replace(' ', '')
    inv = session.get(InviteCode, code)
    if inv is None or inv.revoked:
        raise gone
    exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
    if exp <= datetime.now(timezone.utc):
        raise gone
    person = session.get(User, inv.user_id)
    if person is None:
        raise gone
    return person


@router.get('/invite/{code}')
def preview_invite(code: str, session: Session = Depends(get_session)) -> dict:
    """Public (works before signing up): who invited you. Instagram only if they chose to show it publicly."""
    person = _inviter(code, session)
    return {'id': person.id, 'name': person.name, 'instagram': public_instagram(session.get(SocialProfile, person.id))}


@router.post('/invite/{code}/accept')
def accept_invite(code: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Become friends: you follow them and they follow you (they agreed by sharing the invite)."""
    person = _inviter(code, session)
    if person.id == user.id:
        raise HTTPException(400, "That's your own invite. Share it with a friend!")
    for follower, following in ((user.id, person.id), (person.id, user.id)):
        if session.get(Follow, (follower, following)) is None:
            session.add(Follow(follower_id=follower, following_id=following))
    try:
        session.commit()
    except IntegrityError:  # accepted twice at once
        session.rollback()
    return {'id': person.id, 'name': person.name, 'friends': True}


@router.get('/people/{person_id}')
def view_person(person_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Another member's profile. Name and follow counts are always visible to signed-in members; everything else
    (bio, neighbourhood, interests, Instagram, events) only if that person turned on discovery. You always see your own."""
    from ..events.models import Event, utcnow
    from ..events.router import visible_to

    person = session.get(User, person_id)
    if person is None:
        raise HTTPException(404, 'User not found')
    is_me = person.id == user.id
    profile = session.get(SocialProfile, person.id)
    visible = is_me or bool(profile and profile.discoverable)
    followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == person.id)).all())
    following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == person.id)).all())
    out = {
        'id': person.id, 'name': person.name, 'joined': person.created_at.isoformat(), 'is_me': is_me,
        'private': not visible,
        'follower_count': len(followers), 'following_count': len(following),
        'is_following': user.id in followers, 'follows_you': user.id in following,
    }
    if not visible:
        return out
    mine = session.get(SocialProfile, user.id)
    my_interests = set(json.loads(mine.interests_json)) if mine and mine.discoverable and not is_me else set()
    their_interests = json.loads(profile.interests_json) if profile else []
    events = session.exec(
        select(Event).where(Event.created_by == person.id, Event.start >= utcnow() - timedelta(hours=3), visible_to(user.id, session))
        .order_by(Event.start).limit(20)
    ).all()
    return {**out,
            'bio': profile.bio if profile else '', 'neighbourhood': profile.neighbourhood if profile else '',
            'social_style': profile.social_style if profile else 'A little of both',
            'interests': their_interests, 'shared_interests': sorted(my_interests & set(their_interests)),
            'instagram': (profile.instagram if profile else '') if is_me else public_instagram(profile),
            'events': [{'id': str(e.id), 'title': e.title, 'start': e.start.isoformat(), 'venue': e.venue_name or ''} for e in events]}


# ---------- "My people" on the Explore map ----------
# Profile interests -> map categories (frontend/src/lib/nexus.ts Category)
_INTEREST_CATEGORY = {'Walking & outdoors': 'outdoors', 'Books': 'learning', 'Art & culture': 'arts',
                      'Music': 'arts', 'Sports': 'sports', 'Coffee & conversation': 'social'}
_COLORS = ['#e0457b', '#0e8a5f', '#5a3ff0', '#c2410c', '#0369a1', '#7c3aed', '#b45309', '#be123c']


def _open_to_go_with(viewer_id: int, person_id: int, mutual: bool, row) -> bool:
    """Same audience rules as /api/buddies: off, everyone, mutual follows, or a hand-picked list."""
    from ..events.models import EventRsvp
    mode = row.mode if row else 'selected'
    audience = row.audience if row else 'mutual'
    if mode == 'off':
        return False
    allowed = audience == 'everyone' or (audience == 'mutual' and mutual) or \
        (audience == 'selected' and row is not None and viewer_id in json.loads(row.people_ids_json))
    return allowed and (mode == 'any' or bool(row and json.loads(row.event_ids_json)))


@router.get('/map-people')
async def map_people(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """People you follow, shaped like `Person` in frontend/src/lib/nexus.ts.

    Privacy: a pin appears only if that person turned on discovery AND entered a neighbourhood; the pin is the
    neighbourhood's centre, never an address. Which events they're going to is shown to mutual connections only.
    """
    from ..events.geocode import geocode
    from ..events.models import Event, EventRsvp, utcnow
    from ..events.router import visible_to
    from ..models import BuddyPreference

    following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user.id)).all())
    followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == user.id)).all())
    if not following:
        return {'people': [], 'hidden': 0}
    people = session.exec(select(User).where(User.id.in_(following)).order_by(User.name, User.id)).all()
    profiles = {p.user_id: p for p in session.exec(select(SocialProfile).where(SocialProfile.user_id.in_(following))).all()}
    prefs = {p.user_id: p for p in session.exec(select(BuddyPreference).where(BuddyPreference.user_id.in_(following))).all()}
    visible_events = set(session.exec(select(Event.id).where(Event.start >= utcnow() - timedelta(hours=3), visible_to(user.id, session))).all())

    out, hidden = [], 0
    for person in people:
        profile = profiles.get(person.id)
        if not profile or not profile.discoverable or not profile.neighbourhood.strip():
            hidden += 1
            continue
        point = await geocode(session, f'{profile.neighbourhood}, Calgary, AB')
        if not point:
            hidden += 1
            continue
        mutual = person.id in followers
        going = sorted(str(eid) for eid in session.exec(select(EventRsvp.event_id).where(EventRsvp.user_id == person.id)).all()
                       if eid in visible_events) if mutual else []
        out.append({
            'id': str(person.id), 'name': person.name,
            'relation': 'connection' if mutual else 'following',
            'neighbourhood': profile.neighbourhood,
            'position': {'lat': round(point[0], 4), 'lng': round(point[1], 4)},
            'color': _COLORS[person.id % len(_COLORS)],
            'interests': sorted({_INTEREST_CATEGORY[i] for i in json.loads(profile.interests_json) if i in _INTEREST_CATEGORY}),
            'openToBuddy': _open_to_go_with(user.id, person.id, mutual, prefs.get(person.id)),
            'goingTo': going,
            'languages': [],
        })
    return {'people': out, 'hidden': hidden}
