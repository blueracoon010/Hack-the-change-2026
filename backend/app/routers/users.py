"""Privacy controls: users can see, export and delete everything we store about them."""

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session, select, delete, or_

from ..db import get_session
from ..events.models import Event, EventRsvp
from ..models import User, Follow, SocialProfile, BuddyPreference
from ..schemas import UserOut, UserUpdate
from ..security import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> User:
    user.name = body.name
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.get("/me/export")
def export_me(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    # When you add tables that belong to a user, include their rows here too.
    return {
        "profile": UserOut.model_validate(user, from_attributes=True).model_dump(mode="json"),
        "connections": [edge.model_dump(mode="json") for edge in session.exec(select(Follow).where(or_(Follow.follower_id == user.id, Follow.following_id == user.id))).all()],
        "social_profile": session.get(SocialProfile, user.id).model_dump(mode="json") if session.get(SocialProfile, user.id) else None,
        "buddy_preferences": session.get(BuddyPreference, user.id).model_dump(mode="json") if session.get(BuddyPreference, user.id) else None,
        "events_posted": [e.model_dump(mode="json") for e in session.exec(select(Event).where(Event.created_by == user.id))],
        "rsvps": [r.model_dump(mode="json") for r in session.exec(select(EventRsvp).where(EventRsvp.user_id == user.id))],
        "stored_fields": ["name", "email", "password (hashed with bcrypt, never stored in plain text)", "created_at", "connections", "optional social profile", "events you posted", "event RSVPs"],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    session.exec(delete(Follow).where(or_(Follow.follower_id == user.id, Follow.following_id == user.id)))
    session.exec(delete(SocialProfile).where(SocialProfile.user_id == user.id))
    session.exec(delete(BuddyPreference).where(BuddyPreference.user_id == user.id))
    # Remove references to a deleted person from other users' audience lists.
    import json
    for pref in session.exec(select(BuddyPreference)).all():
        pref.people_ids_json = json.dumps([pid for pid in json.loads(pref.people_ids_json) if pid != user.id])
        session.add(pref)
    mine = session.exec(select(Event.id).where(Event.created_by == user.id)).all()
    session.exec(delete(EventRsvp).where((EventRsvp.user_id == user.id) | EventRsvp.event_id.in_(mine)))
    session.exec(delete(Event).where(Event.created_by == user.id))
    session.delete(user)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
