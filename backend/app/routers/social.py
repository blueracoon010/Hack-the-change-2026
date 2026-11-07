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
                         'instagram': profile.instagram if profile and profile.discoverable else '',
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

class SocialDetails(BaseModel):
    instagram: str = Field(default='', max_length=30)
    interests: list[str] = Field(default_factory=list, max_length=6)
    discoverable: bool = False
    # "About me". None on a PUT = keep what's stored (the Social links form doesn't send these).
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
        value = value.strip().lstrip('@').lower()
        if value and not re.fullmatch(r'[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?', value):
            raise ValueError('Enter an Instagram username, without a URL')
        if '..' in value:
            raise ValueError('Invalid Instagram username')
        return value

    @field_validator('interests')
    @classmethod
    def known_interests(cls, value):
        if not set(value) <= INTERESTS:
            raise ValueError('Unknown interest')
        return sorted(set(value))

@router.get('/profile')
def get_social_profile(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    profile = session.get(SocialProfile, user.id)
    details = SocialDetails(instagram=profile.instagram, interests=json.loads(profile.interests_json), discoverable=profile.discoverable,
                            bio=profile.bio, neighbourhood=profile.neighbourhood, social_style=profile.social_style) if profile \
        else SocialDetails(bio='', neighbourhood='', social_style='A little of both')
    token = jwt.encode({'sub': str(user.id), 'purpose': 'corkboard-invite', 'exp': datetime.now(timezone.utc) + timedelta(days=30)}, settings.jwt_secret, algorithm='HS256') if details.discoverable else None
    return {**details.model_dump(), 'invite_token': token}

@router.put('/profile')
def save_social_profile(body: SocialDetails, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    profile = session.get(SocialProfile, user.id) or SocialProfile(user_id=user.id)
    profile.instagram = body.instagram
    profile.interests_json = json.dumps(body.interests)
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

@router.get('/invite/{token}')
def preview_invite(token: str, session: Session = Depends(get_session)):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
        if payload.get('purpose') != 'corkboard-invite':
            raise ValueError()
        user_id = int(payload['sub'])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(404, 'This invitation is invalid or has expired')
    person = session.get(User, user_id)
    profile = session.get(SocialProfile, user_id)
    if person is None or profile is None or not profile.discoverable:
        raise HTTPException(404, 'This invitation is no longer available')
    return {'id': person.id, 'name': person.name, 'instagram': profile.instagram}


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
            'instagram': profile.instagram if profile else '',
            'events': [{'id': str(e.id), 'title': e.title, 'start': e.start.isoformat(), 'venue': e.venue_name or ''} for e in events]}
