"""Plan with friends: your busy times, your friends' busy times, and the windows when you're all free.

Endpoints (all under /api/schedule):
  GET    /week?start=YYYY-MM-DD&with=2,5   7 days from `start` (Calgary): everyone's busy bars, shared free windows,
                                            and real events on the map that fit inside those windows
  GET    /friends                          your friends (mutual follows) and whether they share their schedule
  POST   /blocks  DELETE /blocks/{id}      block time by hand (busy, work, class, me time, or "open to plans")
  GET/PUT /settings                        share your free/busy with friends (on by default, friends only)
  GET/PUT/DELETE /calendar, POST /calendar/sync   link Google Calendar via its private iCal address
  POST   /import                           upload an .ics file once (Google, Outlook, Apple)

Friends only see *when* you're busy. Labels and imported titles are never shown to anyone else.
"""

from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, delete, select

from ..db import get_session
from ..events.models import Event, EventRsvp
from ..events.router import friend_ids, visible_to
from ..models import User
from ..security import get_current_user
from .ics import CALGARY, busy_times
from .models import KINDS, BusyBlock, CalendarFeed, ScheduleSettings, utcnow

router = APIRouter(prefix="/api/schedule", tags=["schedule"])

DAY_START, DAY_END = time(8), time(22)  # suggest plans between 8 am and 10 pm
MIN_WINDOW = timedelta(minutes=60)
IMPORT_WEEKS = 10
CALENDAR_HOSTS = ("calendar.google.com", "outlook.office365.com", "outlook.live.com", "icloud.com")


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _iso(dt: datetime) -> str:
    return _utc(dt).isoformat().replace("+00:00", "Z")


def _sharing(session: Session, user_id: int) -> bool:
    row = session.get(ScheduleSettings, user_id)
    return True if row is None else row.share_with_friends


# ---------- busy times ----------

def _block_occurrences(b: BusyBlock, start: datetime, end: datetime):
    s, e = _utc(b.start), _utc(b.end)
    if not b.repeat_weekly:
        if e > start and s < end:
            yield s, e
        return
    # Same wall-clock time every week (stays right across daylight-saving changes), from the week it was created.
    local_s, length = s.astimezone(CALGARY), e - s
    first = max(0, (start - s).days // 7 - 1)
    for k in range(first, first + 3):
        occ = (local_s + timedelta(weeks=k)).astimezone(timezone.utc)
        if occ + length > start and occ < end:
            yield occ, occ + length


def _person_busy(session: Session, person_id: int, start: datetime, end: datetime, *, owner: bool) -> list[dict]:
    out: list[dict] = []
    blocks = session.exec(select(BusyBlock).where(BusyBlock.user_id == person_id,
                                                  (BusyBlock.repeat_weekly == True) | ((BusyBlock.start < end) & (BusyBlock.end > start)))).all()  # noqa: E712
    for b in blocks:
        for s, e in _block_occurrences(b, start, end):
            item = {"start": _iso(s), "end": _iso(e), "kind": b.kind if (owner or b.kind == "open") else "busy",
                    "source": b.source}
            if owner:
                item.update(id=b.id, label=b.label, repeat=b.repeat_weekly)
            out.append(item)
    # Events you're going to count as busy. Friends see the event name (they can already see what you're going to).
    rows = session.exec(select(Event).join(EventRsvp, EventRsvp.event_id == Event.id)
                        .where(EventRsvp.user_id == person_id, Event.start < end, Event.start > start - timedelta(hours=12))).all()
    for ev in rows:
        s = _utc(ev.start)
        e = _utc(ev.end) if ev.end else s + timedelta(hours=2)
        if e - s > timedelta(hours=12) or e <= start:
            continue  # all-day / multi-day events don't block the whole day
        out.append({"start": _iso(s), "end": _iso(e), "kind": "event", "source": "rsvp",
                    "label": ev.title if (owner or ev.visibility == "public") else "", "eventId": str(ev.id)})
    return sorted(out, key=lambda x: x["start"])


def _free_windows(busy_lists: list[list[dict]], open_lists: list[list[dict]], days: list[date], tz=CALGARY) -> list[dict]:
    blocked = sorted((datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00")))
                     for lst in busy_lists for b in lst if b["kind"] != "open")
    opens = [(datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00")))
             for lst in open_lists for b in lst if b["kind"] == "open"]
    now = datetime.now(timezone.utc)
    windows: list[dict] = []
    for day in days:
        cursor = datetime.combine(day, DAY_START, tz).astimezone(timezone.utc)
        day_end = datetime.combine(day, DAY_END, tz).astimezone(timezone.utc)
        if cursor < now:  # today: start from the next half hour
            cursor = max(cursor, now.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=30 if now.minute < 30 else 60))
        for s, e in blocked + [(day_end, day_end)]:
            if e <= cursor:
                continue
            gap_end = min(s, day_end)
            if gap_end - cursor >= MIN_WINDOW:
                windows.append({"start": _iso(cursor), "end": _iso(gap_end), "minutes": int((gap_end - cursor).total_seconds() // 60),
                                "preferred": any(os < gap_end and oe > cursor for os, oe in opens)})
            cursor = max(cursor, e)
            if cursor >= day_end:
                break
    return windows


def _fitting_events(session: Session, user_id: int, windows: list[dict], limit_per_window: int = 3) -> list[dict]:
    if not windows:
        return []
    first = datetime.fromisoformat(windows[0]["start"].replace("Z", "+00:00"))
    last = datetime.fromisoformat(windows[-1]["end"].replace("Z", "+00:00"))
    rows = session.exec(select(Event).where(visible_to(user_id, session), Event.start >= first, Event.start < last)
                        .order_by(Event.start, Event.id).limit(500)).all()
    out = []
    for i, w in enumerate(windows):
        ws = datetime.fromisoformat(w["start"].replace("Z", "+00:00"))
        we = datetime.fromisoformat(w["end"].replace("Z", "+00:00"))
        n = 0
        for ev in rows:
            s = _utc(ev.start)
            e = _utc(ev.end) if ev.end else s + timedelta(hours=2)
            if e - s > timedelta(hours=8):
                continue
            if ws <= s and min(e, s + timedelta(hours=3)) <= we:
                out.append({"window": i, "id": str(ev.id), "title": ev.title, "start": _iso(s), "end": _iso(e),
                            "venue": ev.venue_name or ev.address or "", "categories": [c for c in ev.categories.split(",") if c],
                            "price": ev.price or "", "indoor": ev.indoor, "address": ev.address or "",
                            "position": {"lat": ev.lat, "lng": ev.lon} if ev.lat is not None and ev.lon is not None else None})
                n += 1
                if n >= limit_per_window:
                    break
    return out


@router.get("/friends")
def friends(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    ids = friend_ids(session, user.id)
    people = session.exec(select(User).where(User.id.in_(ids)).order_by(User.name, User.id)).all() if ids else []
    return [{"id": p.id, "name": p.name, "sharing": _sharing(session, p.id)} for p in people]


@router.get("/week")
def week(start: date | None = None, with_: str = Query("", alias="with"),
         offset: int | None = Query(None, ge=-14 * 60, le=14 * 60, description="Calgary's UTC offset in minutes as the browser sees it, e.g. -420"),
         user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    # Use the same UTC offset the browser displays with, so "8 am" here is 8 am on screen even if the two
    # time-zone databases disagree (e.g. about daylight saving time).
    tz = timezone(timedelta(minutes=offset)) if offset is not None else CALGARY
    first = start or datetime.now(tz).date()
    days = [first + timedelta(days=i) for i in range(7)]
    w_start = datetime.combine(first, time(0), tz).astimezone(timezone.utc)
    w_end = datetime.combine(first + timedelta(days=7), time(0), tz).astimezone(timezone.utc)

    try:
        wanted = [int(x) for x in with_.split(",") if x.strip()][:8]
    except ValueError:
        raise HTTPException(422, "with must be a comma-separated list of user ids")
    allowed = friend_ids(session, user.id)

    people = [{"id": user.id, "name": user.name, "me": True, "sharing": True,
               "busy": _person_busy(session, user.id, w_start, w_end, owner=True)}]
    for pid in dict.fromkeys(wanted):
        if pid not in allowed or pid == user.id:
            continue  # only friends (mutual follows), never anyone else
        person = session.get(User, pid)
        sharing = _sharing(session, pid)
        people.append({"id": pid, "name": person.name, "me": False, "sharing": sharing,
                       "busy": _person_busy(session, pid, w_start, w_end, owner=False) if sharing else []})

    counted = [p for p in people if p["sharing"]]
    windows = _free_windows([p["busy"] for p in counted], [p["busy"] for p in counted], days, tz)
    feed = session.get(CalendarFeed, user.id)
    return {
        "start": first.isoformat(), "days": [d.isoformat() for d in days],
        "people": people, "together": windows,
        "fits": _fitting_events(session, user.id, windows),
        "calendarLinked": bool(feed), "freeHoursTogether": round(sum(w["minutes"] for w in windows) / 60, 1),
    }


# ---------- blocking time by hand ----------

class BlockIn(BaseModel):
    start: datetime
    end: datetime
    kind: str = "busy"
    label: str = Field("", max_length=80)
    repeat_weekly: bool = False

    @field_validator("kind")
    @classmethod
    def known_kind(cls, v: str) -> str:
        if v not in KINDS:
            raise ValueError(f"kind must be one of {', '.join(KINDS)}")
        return v


@router.post("/blocks", status_code=201)
def add_block(body: BlockIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    s, e = _utc(body.start), _utc(body.end)
    if e <= s:
        raise HTTPException(422, "End time must be after the start time")
    if e - s > timedelta(hours=24):
        raise HTTPException(422, "A block can be at most 24 hours")
    if session.exec(select(BusyBlock.id).where(BusyBlock.user_id == user.id, BusyBlock.source == "manual")).all().__len__() >= 300:
        raise HTTPException(400, "You have too many blocks. Remove a few old ones first.")
    b = BusyBlock(user_id=user.id, start=s, end=e, kind=body.kind, label=body.label.strip(), repeat_weekly=body.repeat_weekly)
    session.add(b)
    session.commit()
    session.refresh(b)
    return {"id": b.id}


@router.delete("/blocks/{block_id}", status_code=204)
def remove_block(block_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    b = session.get(BusyBlock, block_id)
    if b is None or b.user_id != user.id:
        raise HTTPException(404, "Block not found")
    session.delete(b)
    session.commit()
    return Response(status_code=204)


# ---------- sharing ----------

class SettingsIn(BaseModel):
    share_with_friends: bool


@router.get("/settings")
def get_settings(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    feed = session.get(CalendarFeed, user.id)
    return {"share_with_friends": _sharing(session, user.id), "calendar": _feed_out(feed)}


@router.put("/settings")
def put_settings(body: SettingsIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    row = session.get(ScheduleSettings, user.id) or ScheduleSettings(user_id=user.id)
    row.share_with_friends = body.share_with_friends
    session.add(row)
    session.commit()
    return get_settings(user, session)


# ---------- Google Calendar / iCal ----------

def _feed_out(feed: CalendarFeed | None) -> dict | None:
    if feed is None:
        return None
    host = urlparse(feed.url).hostname or ""
    return {"provider": "Google Calendar" if host.endswith("google.com") else "Outlook" if "outlook" in host else "Apple Calendar" if "icloud" in host else "Calendar",
            "lastSynced": _iso(feed.last_synced) if feed.last_synced else None, "error": feed.last_error, "busyCount": feed.busy_count}


def _clean_url(url: str) -> str:
    url = url.strip()
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not any(host == h or host.endswith("." + h) for h in CALENDAR_HOSTS):
        raise HTTPException(422, "Paste the secret iCal address from Google Calendar (starts with https://calendar.google.com/). Outlook and Apple calendar links work too.")
    return url


def _replace_imported(session: Session, user_id: int, text: str) -> int:
    today = datetime.now(CALGARY).date()
    start = datetime.combine(today - timedelta(days=1), time(0), CALGARY).astimezone(timezone.utc)
    end = start + timedelta(weeks=IMPORT_WEEKS)
    times = busy_times(text, start, end)[:2000]
    session.exec(delete(BusyBlock).where(BusyBlock.user_id == user_id, BusyBlock.source == "calendar"))
    for s, e in times:
        session.add(BusyBlock(user_id=user_id, start=s, end=e, kind="busy", source="calendar"))
    return len(times)


async def _sync(session: Session, feed: CalendarFeed) -> None:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            r = await client.get(feed.url, headers={"User-Agent": "Nexus calendar sync"})
        if r.status_code != 200 or "BEGIN:VCALENDAR" not in r.text[:2000]:
            raise ValueError("Couldn't read that calendar. Check you copied the *secret* address in iCal format.")
        if len(r.content) > 5_000_000:
            raise ValueError("That calendar is too large to import.")
        feed.busy_count = _replace_imported(session, feed.user_id, r.text)
        feed.last_error = None
    except (httpx.HTTPError, ValueError) as e:
        feed.last_error = str(e) if isinstance(e, ValueError) else "Couldn't reach that calendar. Try again in a minute."
    feed.last_synced = utcnow()
    session.add(feed)
    session.commit()


class CalendarIn(BaseModel):
    url: str = Field(max_length=1000)


@router.put("/calendar")
async def link_calendar(body: CalendarIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    feed = session.get(CalendarFeed, user.id) or CalendarFeed(user_id=user.id, url="")
    feed.url = _clean_url(body.url)
    await _sync(session, feed)
    if feed.last_error:
        raise HTTPException(422, feed.last_error)
    return _feed_out(feed)


@router.post("/calendar/sync")
async def resync_calendar(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    feed = session.get(CalendarFeed, user.id)
    if feed is None:
        raise HTTPException(404, "No calendar linked")
    await _sync(session, feed)
    return _feed_out(feed)


@router.delete("/calendar", status_code=204)
def unlink_calendar(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    feed = session.get(CalendarFeed, user.id)
    if feed:
        session.delete(feed)
    session.exec(delete(BusyBlock).where(BusyBlock.user_id == user.id, BusyBlock.source == "calendar"))
    session.commit()
    return Response(status_code=204)


class ImportIn(BaseModel):
    content: str = Field(max_length=5_000_000)


@router.post("/import")
def import_ics(body: ImportIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    if "BEGIN:VCALENDAR" not in body.content[:2000]:
        raise HTTPException(422, "That isn't a calendar file (.ics).")
    count = _replace_imported(session, user.id, body.content)
    session.commit()
    return {"imported": count}


def delete_user_schedule_data(session: Session, user_id: int) -> None:
    session.exec(delete(BusyBlock).where(BusyBlock.user_id == user_id))
    session.exec(delete(CalendarFeed).where(CalendarFeed.user_id == user_id))
    session.exec(delete(ScheduleSettings).where(ScheduleSettings.user_id == user_id))
