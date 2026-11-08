"""Direct messages. Only friends (people who follow each other) can message, so strangers can't DM anyone.
Unfollowing someone stops new messages both ways; the history stays visible to both."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, delete, func, or_, select

from ..db import get_session
from ..events.router import friend_ids
from ..models import User
from ..security import get_current_user
from .models import DirectMessage, utcnow

router = APIRouter(prefix="/api/dm", tags=["direct messages"])


class DmIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Write a message first")
        return v


def _out(m: DirectMessage, me: int) -> dict:
    return {"id": m.id, "from": m.sender_id, "to": m.recipient_id, "text": m.text,
            "time": m.created_at.isoformat(), "mine": m.sender_id == me}


def _between(a: int, b: int):
    return or_((DirectMessage.sender_id == a) & (DirectMessage.recipient_id == b),
               (DirectMessage.sender_id == b) & (DirectMessage.recipient_id == a))


@router.get("/conversations")
def conversations(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    """Every friend (so you can start a chat) plus anyone you already have history with, newest first."""
    friends = friend_ids(session, user.id)
    msgs = session.exec(select(DirectMessage).where(or_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == user.id))
                        .order_by(DirectMessage.created_at.desc())).all()
    last: dict[int, DirectMessage] = {}
    unread: dict[int, int] = {}
    for m in msgs:
        other = m.recipient_id if m.sender_id == user.id else m.sender_id
        last.setdefault(other, m)
        if m.recipient_id == user.id and m.read_at is None:
            unread[other] = unread.get(other, 0) + 1
    ids = friends | set(last)
    names = {u.id: u.name for u in session.exec(select(User).where(User.id.in_(ids))).all()} if ids else {}
    rows = [{"id": i, "name": names.get(i, "Former member"), "friend": i in friends,
             "last": _out(last[i], user.id) if i in last else None, "unread": unread.get(i, 0)} for i in ids if i in names]
    rows.sort(key=lambda r: (r["last"] is None, -(0 if r["last"] is None else _ts(r["last"]["time"])), r["name"].lower()))
    return rows


def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso).timestamp()


@router.get("/unread")
def unread_count(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    n = session.exec(select(func.count()).select_from(DirectMessage)
                     .where(DirectMessage.recipient_id == user.id, DirectMessage.read_at.is_(None))).one()
    return {"unread": n}


@router.get("/with/{person_id}")
def thread(person_id: int, limit: int = Query(200, ge=1, le=500),
           user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    person = session.get(User, person_id)
    if person is None or person_id == user.id:
        raise HTTPException(404, "Person not found")
    friends = person_id in friend_ids(session, user.id)
    rows = session.exec(select(DirectMessage).where(_between(user.id, person_id))
                        .order_by(DirectMessage.created_at.desc(), DirectMessage.id.desc()).limit(limit)).all()
    if not friends and not rows:
        raise HTTPException(403, "You can message people once you follow each other")
    # Opening the chat marks their messages to you as read.
    now = utcnow()
    for m in rows:
        if m.recipient_id == user.id and m.read_at is None:
            m.read_at = now
            session.add(m)
    session.commit()
    return {"person": {"id": person.id, "name": person.name}, "canMessage": friends,
            "messages": [_out(m, user.id) for m in reversed(rows)]}


@router.post("/with/{person_id}", status_code=201)
def send(person_id: int, body: DmIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if person_id not in friend_ids(session, user.id):
        raise HTTPException(403, "You can message people once you follow each other")
    m = DirectMessage(sender_id=user.id, recipient_id=person_id, text=body.text)
    session.add(m)
    session.commit()
    session.refresh(m)
    return _out(m, user.id)


@router.delete("/messages/{message_id}", status_code=204)
def unsend(message_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    m = session.get(DirectMessage, message_id)
    if not m or m.sender_id != user.id:
        raise HTTPException(404, "Message not found or not yours")
    session.delete(m)
    session.commit()
    return Response(status_code=204)


def delete_user_dms(session: Session, user_id: int) -> None:
    session.exec(delete(DirectMessage).where(or_(DirectMessage.sender_id == user_id, DirectMessage.recipient_id == user_id)))


def export_user_dms(session: Session, user_id: int) -> list[dict]:
    rows = session.exec(select(DirectMessage).where(or_(DirectMessage.sender_id == user_id, DirectMessage.recipient_id == user_id))).all()
    return [_out(m, user_id) for m in rows]
