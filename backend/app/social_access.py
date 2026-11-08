"""Who can see a member's full profile (bio, neighbourhood, interests, events, badges, map pin).

Works like Instagram: a public profile is visible to every signed-in member. A private profile is visible only to
the person themself and to the followers they accepted (following a private account needs their approval).
"""
from sqlmodel import Session

from .models import Follow, SocialProfile


def is_public(session: Session, person_id: int) -> bool:
    profile = session.get(SocialProfile, person_id)
    return bool(profile and profile.discoverable)


def can_view_profile(session: Session, viewer_id: int, person_id: int) -> bool:
    return viewer_id == person_id or is_public(session, person_id) or session.get(Follow, (viewer_id, person_id)) is not None
