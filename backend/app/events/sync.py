"""Fetch every configured source -> classify -> geocode -> upsert into the Event table.

Runs on startup and every EVENTS_SYNC_MINUTES (see start_background_sync), or on demand via POST /api/events/sync.
"""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select

from ..config import settings
from ..db import engine
from . import classify
from .geocode import geocode
from .models import Event, SyncRun, utcnow
from .schemas import EventIn
from .sources import SOURCES

log = logging.getLogger("events.sync")
_running = asyncio.Lock()


def apply(row: Event, e: EventIn) -> None:
    cats = e.categories or classify.categorize(e.title, e.description, e.raw_category)
    row.title = e.title
    row.description = e.description
    row.host = e.host
    row.categories = ",".join(cats)
    row.vibe = e.vibe or classify.vibe(e.title, e.description, e.raw_category)
    row.languages = ",".join(e.languages)
    row.indoor = e.indoor if e.indoor is not None else classify.indoor(cats, e.title)
    row.start, row.end = e.start, e.end
    row.venue_name, row.address = e.venue_name, e.address
    row.lat, row.lon = e.lat, e.lon
    row.url, row.image_url, row.price = e.url, e.image_url, e.price
    row.is_online = e.is_online
    row.scanned_from = e.scanned_from
    row.fetched_at = utcnow()


async def sync_source(session: Session, source) -> SyncRun:
    run = SyncRun(source=source.NAME, ok=False)
    try:
        events = await source.fetch(settings.events_center_lat, settings.events_center_lon,
                                    settings.events_radius_km, settings.events_days_ahead)
        run.fetched = len(events)
        for e in events:
            if (e.lat is None or e.lon is None) and e.address and not e.is_online:
                point = await geocode(session, e.address)
                if point:
                    e.lat, e.lon = point
            if (e.lat is None or e.lon is None) and not e.is_online:
                run.skipped_no_location += 1  # can't put it on the map
                continue
            row = session.exec(select(Event).where(Event.source == e.source, Event.source_id == e.source_id)).first()
            row = row or Event(source=e.source, source_id=e.source_id, title=e.title, start=e.start)
            apply(row, e)
            session.add(row)
            try:
                session.commit()  # per row: another backend on the shared DB may insert the same event at the same moment
            except IntegrityError:
                session.rollback()
                continue
            run.saved += 1
        run.ok = True
    except Exception as ex:  # one broken source must never break the others
        log.exception("sync %s failed", source.NAME)
        run.error = str(ex)[:500]
    run.finished_at = utcnow()
    session.add(run)
    session.commit()
    return run


def prune_past(session: Session) -> None:
    """Delete synced events that ended more than a day ago (community events are kept)."""
    cutoff = utcnow() - timedelta(days=1)
    stale = session.exec(select(Event.id).where(Event.source != "community", Event.start < cutoff)).all()
    if stale:
        from .models import EventRsvp, EventSave
        session.exec(delete(EventRsvp).where(EventRsvp.event_id.in_(stale)))
        session.exec(delete(EventSave).where(EventSave.event_id.in_(stale)))
        session.exec(delete(Event).where(Event.id.in_(stale)))
        session.commit()


def synced_recently(session: Session, source_name: str) -> bool:
    """With a shared database, several teammates' backends run this loop. If any of them synced this source
    recently, the data is already fresh for everyone, so skip (saves API quota)."""
    window = timedelta(minutes=max(settings.events_sync_minutes - 1, 1))
    last = session.exec(select(SyncRun).where(SyncRun.source == source_name, SyncRun.ok == True)  # noqa: E712
                        .order_by(SyncRun.finished_at.desc())).first()
    return bool(last and utcnow() - _aware(last.finished_at) < window)


def _aware(dt):
    from .schemas import to_utc
    return to_utc(dt)


async def sync_all(force: bool = False) -> list[SyncRun]:
    async with _running:
        with Session(engine) as session:
            runs = [await sync_source(session, s) for s in SOURCES
                    if s.configured() and (force or not synced_recently(session, s.NAME))]
            prune_past(session)
            for r in runs:
                session.refresh(r)
            return runs


async def _loop() -> None:
    while True:
        try:
            await sync_all()
        except Exception:
            log.exception("events sync loop error")
        await asyncio.sleep(settings.events_sync_minutes * 60)


def start_background_sync() -> asyncio.Task | None:
    """Called from app lifespan. No task if nothing is configured or EVENTS_SYNC_MINUTES=0."""
    if settings.events_sync_minutes <= 0 or not any(s.configured() for s in SOURCES):
        return None
    return asyncio.create_task(_loop())
