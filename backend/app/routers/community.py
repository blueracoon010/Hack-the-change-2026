"""Community groups: memberships and channel chat, stored in the (shared) database.

Built-in group names, icons and descriptions live in the frontend (src/lib/community.ts); this file only needs their
ids and channels so it can reject unknown ones. Add a built-in group in BOTH places.
Communities people create themselves (CustomCommunity) are stored here in full and returned by GET /groups.
"""
import json
import re
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, func, select

from ..db import get_session
from ..models import CustomCommunity, Follow, FollowRequest, GroupMembership, GroupMessage, User
from ..security import get_current_user

router = APIRouter(prefix="/api/community", tags=["community"])

CHANNELS: dict[str, list[str]] = {
    "walk": ["introductions", "weekend-walks", "general"],
    "books": ["introductions", "what-we-are-reading", "general"],
    "art": ["introductions", "creative-corner", "general"],
    "coffee": ["introductions", "coffee-plans", "general"],
}


ICONS = ("users", "walk", "books", "art", "coffee", "music", "sports", "heart", "sprout", "gamepad", "baby", "globe")
MAX_OWNED = 10


def _friends(session: Session, user_id: int) -> set[int]:
    following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == user_id)).all())
    followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == user_id)).all())
    return following & followers


def _can_see(session: Session, c: CustomCommunity, user_id: int) -> bool:
    if c.visibility == "public" or c.owner_id == user_id or _is_member(session, c.id, user_id):
        return True
    return c.owner_id in _friends(session, user_id)


def _group(group_id: str, session: Session | None = None, user_id: int | None = None) -> list[str]:
    """Channels of a group the user may see, or 404 (private communities you can't see look like they don't exist)."""
    if group_id in CHANNELS:
        return CHANNELS[group_id]
    c = session.get(CustomCommunity, group_id) if session is not None else None
    if c is None or user_id is None or not _can_see(session, c, user_id):
        raise HTTPException(404, "Group not found")
    return json.loads(c.channels_json)


def _custom_out(c: CustomCommunity, members: int, joined: bool, me: int, owner_name: str) -> dict:
    return {"id": c.id, "members": members, "joined": joined, "custom": True, "name": c.name, "description": c.description,
            "interest": c.interest, "icon": c.icon, "visibility": c.visibility, "channels": json.loads(c.channels_json),
            "mine": c.owner_id == me, "owner": owner_name}


_CHANNEL = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class CommunityIn(BaseModel):
    name: str = Field(min_length=3, max_length=60)
    description: str = Field("", max_length=300)
    interest: str = Field("", max_length=40)
    icon: str = "users"
    visibility: Literal["public", "private"] = "public"
    channels: list[str] = Field(default_factory=lambda: ["introductions", "general"], max_length=8)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Give your community a name")
        return v

    @field_validator("icon")
    @classmethod
    def _icon(cls, v: str) -> str:
        return v if v in ICONS else "users"

    @field_validator("channels")
    @classmethod
    def _channels(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for raw in v:
            c = re.sub(r"[^a-z0-9]+", "-", raw.strip().lower()).strip("-")[:30]
            if c and _CHANNEL.match(c) and c not in out:
                out.append(c)
        return out or ["general"]


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
    """Real member counts and whether you joined. Built-in groups: merge with the details in the frontend.
    Communities people made come with their full details (custom: true)."""
    counts = dict(session.exec(select(GroupMembership.group_id, func.count()).group_by(GroupMembership.group_id)).all())
    mine = set(session.exec(select(GroupMembership.group_id).where(GroupMembership.user_id == user.id)).all())
    out = [{"id": g, "members": counts.get(g, 0), "joined": g in mine} for g in CHANNELS]
    friends = _friends(session, user.id)
    customs = session.exec(select(CustomCommunity).order_by(CustomCommunity.created_at.desc())).all()
    visible = [c for c in customs if c.visibility == "public" or c.owner_id == user.id or c.id in mine or c.owner_id in friends]
    owners = {u.id: u.name for u in session.exec(select(User).where(User.id.in_({c.owner_id for c in visible})))} if visible else {}
    out += [_custom_out(c, counts.get(c.id, 0), c.id in mine, user.id, owners.get(c.owner_id, "")) for c in visible]
    return out


@router.post("/groups", status_code=201)
def create_group(body: CommunityIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    owned = session.exec(select(func.count()).select_from(CustomCommunity).where(CustomCommunity.owner_id == user.id)).one()
    if owned >= MAX_OWNED:
        raise HTTPException(400, f"You can run up to {MAX_OWNED} communities")
    c = CustomCommunity(id=f"c-{secrets.token_hex(4)}", owner_id=user.id, name=body.name, description=body.description.strip(),
                        interest=body.interest.strip(), icon=body.icon, visibility=body.visibility, channels_json=json.dumps(body.channels))
    session.add(c)
    session.add(GroupMembership(group_id=c.id, user_id=user.id))  # the creator is the first member
    session.commit()
    return _custom_out(c, 1, True, user.id, user.name)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    c = session.get(CustomCommunity, group_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(404, "Community not found or not yours")
    _delete_custom(session, [group_id])
    session.commit()
    return Response(status_code=204)


def _delete_custom(session: Session, ids: list[str]) -> None:
    if not ids:
        return
    session.exec(delete(GroupMessage).where(GroupMessage.group_id.in_(ids)))
    session.exec(delete(GroupMembership).where(GroupMembership.group_id.in_(ids)))
    session.exec(delete(CustomCommunity).where(CustomCommunity.id.in_(ids)))


@router.put("/groups/{group_id}/membership", status_code=204)
def join(group_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    _group(group_id, session, user.id)
    if not _is_member(session, group_id, user.id):
        session.add(GroupMembership(group_id=group_id, user_id=user.id))
        try:
            session.commit()
        except IntegrityError:  # double click / two tabs
            session.rollback()
    return Response(status_code=204)


@router.delete("/groups/{group_id}/membership", status_code=204)
def leave(group_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    _group(group_id, session, user.id)
    c = session.get(CustomCommunity, group_id)
    if c and c.owner_id == user.id:
        raise HTTPException(400, "You run this community. Delete it instead of leaving.")
    row = session.get(GroupMembership, (group_id, user.id))
    if row:
        session.delete(row)
        session.commit()
    return Response(status_code=204)


@router.get("/groups/{group_id}/channels/{channel}/messages")
def messages(group_id: str, channel: str, limit: int = Query(100, ge=1, le=500),
             user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    if channel not in _group(group_id, session, user.id):
        raise HTTPException(404, "Channel not found")
    rows = session.exec(
        select(GroupMessage, User.name).join(User, User.id == GroupMessage.user_id)
        .where(GroupMessage.group_id == group_id, GroupMessage.channel == channel)
        .order_by(GroupMessage.created_at.desc(), GroupMessage.id.desc()).limit(limit)
    ).all()
    relation = _relations(session, user.id, {m.user_id for m, _ in rows})
    return [{"id": m.id, "user_id": m.user_id, "name": name, "text": m.text, "time": m.created_at.isoformat(), "mine": m.user_id == user.id,
             "relation": relation.get(m.user_id, "none")}
            for m, name in reversed(rows)]


def _relations(session: Session, me: int, ids: set[int]) -> dict[int, str]:
    """How you're connected to each author, so the chat can offer "Add friend" or "Message"."""
    ids = ids - {me}
    if not ids:
        return {me: "me"}
    following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == me, Follow.following_id.in_(ids))).all())
    followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == me, Follow.follower_id.in_(ids))).all())
    requested = set(session.exec(select(FollowRequest.target_id).where(FollowRequest.requester_id == me, FollowRequest.target_id.in_(ids))).all())
    out = {me: "me"}
    for i in ids:
        out[i] = ("friend" if i in followers else "following") if i in following else "requested" if i in requested else "follows-you" if i in followers else "none"
    return out


@router.post("/groups/{group_id}/channels/{channel}/messages", status_code=201)
def post_message(group_id: str, channel: str, body: MessageIn,
                 user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if channel not in _group(group_id, session, user.id):
        raise HTTPException(404, "Channel not found")
    if not _is_member(session, group_id, user.id):
        raise HTTPException(403, "Join this community to post")
    m = GroupMessage(group_id=group_id, channel=channel, user_id=user.id, text=body.text)
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"id": m.id, "user_id": user.id, "name": user.name, "text": m.text, "time": m.created_at.isoformat(), "mine": True, "relation": "me"}


@router.delete("/messages/{message_id}", status_code=204)
def delete_message(message_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    m = session.get(GroupMessage, message_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Message not found or not yours")
    session.delete(m)
    session.commit()
    return Response(status_code=204)


def delete_user_community_data(session: Session, user_id: int) -> None:
    """Called when an account is deleted. Communities they created go with them."""
    _delete_custom(session, list(session.exec(select(CustomCommunity.id).where(CustomCommunity.owner_id == user_id)).all()))
    session.exec(delete(GroupMessage).where(GroupMessage.user_id == user_id))
    session.exec(delete(GroupMembership).where(GroupMembership.user_id == user_id))
