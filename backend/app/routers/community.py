"""Community groups: memberships and channel chat, stored in the (shared) database.

Group names, icons and descriptions live in the frontend (src/lib/community.ts); this file only needs the ids and
channels so it can reject unknown ones. Add a group in BOTH places.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, func, select

from ..db import get_session
from ..models import GroupMembership, GroupMessage, User
from ..security import get_current_user

router = APIRouter(prefix="/api/community", tags=["community"])

CHANNELS: dict[str, list[str]] = {
    "walk": ["introductions", "weekend-walks", "general"],
    "books": ["introductions", "what-we-are-reading", "general"],
    "art": ["introductions", "creative-corner", "general"],
    "coffee": ["introductions", "coffee-plans", "general"],
}


def _group(group_id: str) -> list[str]:
    if group_id not in CHANNELS:
        raise HTTPException(404, "Group not found")
    return CHANNELS[group_id]


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Write a message first")
        return v


def _is_member(session: Session, group_id: str, user_id: int) -> bool:
    return session.get(GroupMembership, (group_id, user_id)) is not None


@router.get("/groups")
def groups(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    """Real member counts and whether you joined. Merge with the group details in the frontend."""
    counts = dict(session.exec(select(GroupMembership.group_id, func.count()).group_by(GroupMembership.group_id)).all())
    mine = set(session.exec(select(GroupMembership.group_id).where(GroupMembership.user_id == user.id)).all())
    return [{"id": g, "members": counts.get(g, 0), "joined": g in mine} for g in CHANNELS]


@router.put("/groups/{group_id}/membership", status_code=204)
def join(group_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    _group(group_id)
    if not _is_member(session, group_id, user.id):
        session.add(GroupMembership(group_id=group_id, user_id=user.id))
        try:
            session.commit()
        except IntegrityError:  # double click / two tabs
            session.rollback()
    return Response(status_code=204)


@router.delete("/groups/{group_id}/membership", status_code=204)
def leave(group_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    _group(group_id)
    row = session.get(GroupMembership, (group_id, user.id))
    if row:
        session.delete(row)
        session.commit()
    return Response(status_code=204)


@router.get("/groups/{group_id}/channels/{channel}/messages")
def messages(group_id: str, channel: str, limit: int = Query(100, ge=1, le=500),
             user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    if channel not in _group(group_id):
        raise HTTPException(404, "Channel not found")
    rows = session.exec(
        select(GroupMessage, User.name).join(User, User.id == GroupMessage.user_id)
        .where(GroupMessage.group_id == group_id, GroupMessage.channel == channel)
        .order_by(GroupMessage.created_at.desc(), GroupMessage.id.desc()).limit(limit)
    ).all()
    return [{"id": m.id, "user_id": m.user_id, "name": name, "text": m.text, "time": m.created_at.isoformat(), "mine": m.user_id == user.id}
            for m, name in reversed(rows)]


@router.post("/groups/{group_id}/channels/{channel}/messages", status_code=201)
def post_message(group_id: str, channel: str, body: MessageIn,
                 user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if channel not in _group(group_id):
        raise HTTPException(404, "Channel not found")
    if not _is_member(session, group_id, user.id):
        raise HTTPException(403, "Join this community to post")
    m = GroupMessage(group_id=group_id, channel=channel, user_id=user.id, text=body.text)
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"id": m.id, "user_id": user.id, "name": user.name, "text": m.text, "time": m.created_at.isoformat(), "mine": True}


@router.delete("/messages/{message_id}", status_code=204)
def delete_message(message_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    m = session.get(GroupMessage, message_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Message not found or not yours")
    session.delete(m)
    session.commit()
    return Response(status_code=204)


def delete_user_community_data(session: Session, user_id: int) -> None:
    """Called when an account is deleted."""
    session.exec(delete(GroupMessage).where(GroupMessage.user_id == user_id))
    session.exec(delete(GroupMembership).where(GroupMembership.user_id == user_id))
