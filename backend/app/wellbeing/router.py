"""Journal (private notes + mood) and positive-affirmation flashcards.

Affirmations are a curated set on two themes only: happiness and community belonging. (Public affirmation APIs
such as affirmations.dev return random lines with no way to pick a theme, so they kept going off-topic.)
"""

import random
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, delete, func, select

from ..db import get_session
from ..models import User
from ..security import get_current_user
from .models import MOODS, JournalEntry, utcnow

router = APIRouter(prefix="/api/wellbeing", tags=["wellbeing"])

AFFIRMATIONS = {
    "happiness": [
        "I let small joys count today.",
        "I deserve good days, and today can be one.",
        "Happiness grows when I share it.",
        "I am allowed to rest, laugh and enjoy this moment.",
        "Something good is on its way to me.",
        "I notice what is going right.",
        "My smile can brighten someone's day, including mine.",
        "I choose to be gentle with myself today.",
        "Today I make room for things that make me feel alive.",
        "I am proud of how far I have come.",
        "Joy is not a reward. I can have it now.",
        "I carry warmth wherever I go.",
        "Little moments of happiness add up.",
        "I am grateful for the people who make me smile.",
    ],
    "belonging": [
        "I belong here, just as I am.",
        "There are people who are glad I exist.",
        "My presence makes a community better.",
        "It's okay to be new. Every friend was once a stranger.",
        "I am worth getting to know.",
        "Saying hello is a brave and beautiful thing.",
        "I am part of something bigger than myself.",
        "My neighbourhood is full of people I haven't met yet.",
        "I bring something no one else can.",
        "Reaching out is a strength, not a weakness.",
        "I can make someone feel welcome today.",
        "Connection starts with one small step, and I can take it.",
        "I don't have to do life alone.",
        "The right people will be happy to see me.",
    ],
}


@router.get("/affirmations")
def affirmations(count: int = Query(12, ge=1, le=28), theme: str | None = Query(None, pattern="^(happiness|belonging)$")) -> dict:
    """A shuffled deck of happiness and belonging affirmations. Public: no sign-in needed."""
    themes = [theme] if theme else list(AFFIRMATIONS)
    cards = [{"text": t, "theme": th} for th in themes for t in AFFIRMATIONS[th]]
    random.shuffle(cards)
    return {"source": "Nexus", "themes": themes, "cards": [c["text"] for c in cards[:count]], "deck": cards[:count]}


class EntryIn(BaseModel):
    title: str = Field("", max_length=200)
    body: str = Field("", max_length=20_000)
    mood: str | None = None

    @field_validator("mood")
    @classmethod
    def _mood(cls, v: str | None) -> str | None:
        if v is not None and v not in MOODS:
            raise ValueError(f"mood must be one of {', '.join(MOODS)}")
        return v


def _out(e: JournalEntry) -> dict:
    return {"id": e.id, "title": e.title, "body": e.body, "mood": e.mood,
            "createdAt": e.created_at.isoformat(), "updatedAt": e.updated_at.isoformat()}


def _mine(session: Session, entry_id: int, user: User) -> JournalEntry:
    e = session.get(JournalEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    return e


@router.get("/journal")
def list_entries(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    rows = session.exec(select(JournalEntry).where(JournalEntry.user_id == user.id)
                        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc()).limit(500)).all()
    return [_out(e) for e in rows]


@router.post("/journal", status_code=201)
def create_entry(body: EntryIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    e = JournalEntry(user_id=user.id, title=body.title.strip(), body=body.body, mood=body.mood)
    session.add(e)
    session.commit()
    session.refresh(e)
    return _out(e)


@router.put("/journal/{entry_id}")
def update_entry(entry_id: int, body: EntryIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    e = _mine(session, entry_id, user)
    e.title, e.body, e.mood, e.updated_at = body.title.strip(), body.body, body.mood, utcnow()
    session.add(e)
    session.commit()
    session.refresh(e)
    return _out(e)


@router.delete("/journal/{entry_id}", status_code=204)
def delete_entry(entry_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    session.delete(_mine(session, entry_id, user))
    session.commit()
    return Response(status_code=204)


@router.get("/journal/moods")
def mood_summary(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    """Mood counts over the last 30 days, for the small check-in strip."""
    since = utcnow() - timedelta(days=30)
    rows = session.exec(select(JournalEntry.mood, func.count()).where(
        JournalEntry.user_id == user.id, JournalEntry.mood.is_not(None), JournalEntry.created_at >= since)
        .group_by(JournalEntry.mood)).all()
    return {"days": 30, "moods": {m: n for m, n in rows}}


def delete_user_journal(session: Session, user_id: int) -> None:
    session.exec(delete(JournalEntry).where(JournalEntry.user_id == user_id))


def export_user_journal(session: Session, user_id: int) -> list[dict]:
    return [_out(e) for e in session.exec(select(JournalEntry).where(JournalEntry.user_id == user_id)).all()]
