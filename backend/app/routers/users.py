"""Privacy controls: users can see, export and delete everything we store about them."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select, delete, or_

from ..db import get_session
from ..events.models import BuddyPair, Event, EventRsvp, EventSave
from ..models import User, Follow, FollowRequest, SocialProfile, BuddyPreference, GroupMembership, GroupMessage, InviteCode, CustomCommunity, UserAvatar
from ..social_access import can_view_profile
from ..wellbeing.router import delete_user_journal, export_user_journal
from ..dm.router import delete_user_dms, export_user_dms
from .community import delete_user_community_data
from ..schedule.router import delete_user_schedule_data
from ..schedule.models import BusyBlock, ScheduleSettings
from ..badges.router import delete_user_badge_data, export_user_badge_data
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
        "buddy_pairs": [p.model_dump(mode="json") for p in session.exec(select(BuddyPair).where((BuddyPair.requester_id == user.id) | (BuddyPair.companion_id == user.id)))],
        "saved_events": [s.model_dump(mode="json") for s in session.exec(select(EventSave).where(EventSave.user_id == user.id))],
        "community_groups": [m.model_dump(mode="json") for m in session.exec(select(GroupMembership).where(GroupMembership.user_id == user.id))],
        "community_messages": [m.model_dump(mode="json") for m in session.exec(select(GroupMessage).where(GroupMessage.user_id == user.id))],
        "schedule_blocks": [b.model_dump(mode="json") for b in session.exec(select(BusyBlock).where(BusyBlock.user_id == user.id))],
        "schedule_sharing": session.get(ScheduleSettings, user.id).model_dump(mode="json") if session.get(ScheduleSettings, user.id) else None,
        "event_photos": export_user_badge_data(session, user.id),
        "communities_created": [c.model_dump(mode="json") for c in session.exec(select(CustomCommunity).where(CustomCommunity.owner_id == user.id))],
        "journal": export_user_journal(session, user.id),
        "profile_photo": session.get(UserAvatar, user.id).photo if session.get(UserAvatar, user.id) else None,
        "direct_messages": export_user_dms(session, user.id),
        "stored_fields": ["name", "email", "password (hashed with bcrypt, never stored in plain text)", "created_at", "connections", "optional social profile", "events you posted", "event RSVPs", "saved events and reminders", "community groups joined", "community messages you posted", "busy times you added or imported (no titles from imported calendars)", "your linked calendar address", "event photos and check-ins"],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    session.exec(delete(Follow).where(or_(Follow.follower_id == user.id, Follow.following_id == user.id)))
    session.exec(delete(FollowRequest).where(or_(FollowRequest.requester_id == user.id, FollowRequest.target_id == user.id)))
    session.exec(delete(SocialProfile).where(SocialProfile.user_id == user.id))
    session.exec(delete(BuddyPreference).where(BuddyPreference.user_id == user.id))
    # Remove references to a deleted person from other users' audience lists.
    import json
    for pref in session.exec(select(BuddyPreference)).all():
        pref.people_ids_json = json.dumps([pid for pid in json.loads(pref.people_ids_json) if pid != user.id])
        session.add(pref)
    mine = session.exec(select(Event.id).where(Event.created_by == user.id)).all()
    session.exec(delete(BuddyPair).where((BuddyPair.requester_id == user.id) | (BuddyPair.companion_id == user.id) | BuddyPair.event_id.in_(mine)))
    session.exec(delete(EventRsvp).where((EventRsvp.user_id == user.id) | EventRsvp.event_id.in_(mine)))
    session.exec(delete(EventSave).where((EventSave.user_id == user.id) | EventSave.event_id.in_(mine)))
    delete_user_community_data(session, user.id)
    delete_user_schedule_data(session, user.id)
    delete_user_badge_data(session, user.id)
    delete_user_journal(session, user.id)
    session.exec(delete(UserAvatar).where(UserAvatar.user_id == user.id))
    delete_user_dms(session, user.id)
    session.exec(delete(InviteCode).where(InviteCode.user_id == user.id))
    from ..badges.router import detach_checkins
    detach_checkins(session, mine)
    session.exec(delete(Event).where(Event.created_by == user.id))
    session.delete(user)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Profile photo ----------
MAX_PHOTO_CHARS = 400_000  # a 512px JPEG data URL is ~40-120 KB; this leaves headroom
PHOTO_PREFIXES = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")


class AvatarIn(BaseModel):
    photo: str = Field(max_length=MAX_PHOTO_CHARS)


@router.put("/me/avatar")
def set_avatar(body: AvatarIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if not body.photo.startswith(PHOTO_PREFIXES):
        raise HTTPException(422, "Upload a JPEG, PNG or WebP photo")
    row = session.get(UserAvatar, user.id) or UserAvatar(user_id=user.id, photo=body.photo)
    row.photo, row.updated_at = body.photo, datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return {"photo": row.photo, "updatedAt": row.updated_at.isoformat()}


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def remove_avatar(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    session.exec(delete(UserAvatar).where(UserAvatar.user_id == user.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{person_id}/avatar")
def get_avatar(person_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Same rule as the profile: yourself, public profiles, or people you follow. Otherwise just no photo."""
    row = session.get(UserAvatar, person_id)
    if row is None or not can_view_profile(session, user.id, person_id):
        return {"photo": None}
    return {"photo": row.photo, "updatedAt": row.updated_at.isoformat()}
