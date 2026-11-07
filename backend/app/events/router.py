"""/api/events endpoints for the map. Interactive docs: http://localhost:8000/docs#/events"""

import math
from datetime import datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, delete, func, select

from ..config import settings
from ..db import get_session
from ..models import User
from ..security import get_current_user
from .geocode import geocode
from .models import Event, EventRsvp, SyncRun, utcnow
from .schemas import CommunityEventIn, EventOut, LatLng, RsvpIn, iso_utc, to_utc
from .sources import SOURCES
from .sync import sync_all

router = APIRouter(prefix="/api/events", tags=["events"])
_bearer = HTTPBearer(auto_error=False)
DEFAULT_DURATION_MIN = 120


def optional_user_id(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> int | None:
    """Browsing the map works signed out; signed in we also mark your RSVPs and your own events."""
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        if payload.get('purpose', 'access') != 'access':
            return None
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def to_out(e: Event, counts: dict[int, tuple[int, int]], mine_rsvp: set[int], user_id: int | None,
           here: tuple[float, float] | None) -> EventOut:
    going, buddy = counts.get(e.id, (0, 0))
    duration = int((e.end - e.start).total_seconds() // 60) if e.end and e.end > e.start else DEFAULT_DURATION_MIN
    return EventOut(
        id=str(e.id),
        title=e.title,
        host=e.host or e.venue_name or "",
        categories=[c for c in e.categories.split(",") if c],
        vibe=e.vibe,
        start=iso_utc(e.start),
        duration_min=duration,
        venue=e.venue_name or ("Online" if e.is_online else ""),
        address=e.address or "",
        position=LatLng(lat=e.lat or 0.0, lng=e.lon or 0.0),
        cost=e.price or ("Free" if e.source == "community" else "See listing"),
        indoor=e.indoor,
        going=going,
        looking_for_buddy=buddy,
        languages=[l for l in e.languages.split(",") if l],
        description=e.description or "",
        scanned_from=e.scanned_from or e.source.title(),
        source=e.source,
        end=iso_utc(e.end),
        url=e.url,
        image_url=e.image_url,
        is_online=e.is_online,
        distance_km=round(haversine_km(here[0], here[1], e.lat, e.lon), 2) if here and e.lat is not None else None,
        me_going=e.id in mine_rsvp,
        mine=user_id is not None and e.created_by == user_id,
    )


def rsvp_counts(session: Session, ids: list[int]) -> dict[int, tuple[int, int]]:
    if not ids:
        return {}
    rows = session.exec(
        select(EventRsvp.event_id, func.count(), func.sum(EventRsvp.looking_for_buddy))
        .where(EventRsvp.event_id.in_(ids)).group_by(EventRsvp.event_id)
    ).all()
    return {eid: (n, int(b or 0)) for eid, n, b in rows}


@router.get("", response_model=list[EventOut], response_model_by_alias=True)
def list_events(
    start: datetime | None = Query(None, alias="from", description="ISO time, default now"),
    end: datetime | None = Query(None, alias="to", description="ISO time, default from + 30 days"),
    bbox: str | None = Query(None, description="west,south,east,north (Leaflet map.getBounds().toBBoxString())"),
    lat: float | None = Query(None, description="Your location: adds distanceKm and sorts nearest first"),
    lng: float | None = None,
    radius_km: float | None = Query(None, alias="radiusKm", gt=0, description="With lat/lng: only events within this distance"),
    category: list[str] = Query([], description="Repeat to OR them: ?category=tech&category=arts"),
    vibe: str | None = None,
    q: str | None = Query(None, description="Search title, host, venue"),
    source: str | None = Query(None, description="ticketmaster | meetup | community"),
    include_online: bool = Query(False, alias="includeOnline"),
    limit: int = Query(500, ge=1, le=2000),
    user_id: int | None = Depends(optional_user_id),
    session: Session = Depends(get_session),
) -> list[EventOut]:
    t0 = to_utc(start) if start else utcnow() - timedelta(hours=3)  # keep events that started recently
    t1 = to_utc(end) if end else t0 + timedelta(days=settings.events_days_ahead)
    stmt = select(Event).where(Event.start >= t0, Event.start <= t1)
    if not include_online:
        stmt = stmt.where(Event.is_online == False, Event.lat.is_not(None))  # noqa: E712
    if bbox:
        try:
            w, s, e, n = (float(x) for x in bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox must be west,south,east,north")
        stmt = stmt.where(Event.lon >= w, Event.lon <= e, Event.lat >= s, Event.lat <= n)
    if source:
        stmt = stmt.where(Event.source == source)
    if vibe:
        stmt = stmt.where(Event.vibe == vibe)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Event.title).like(like) | func.lower(Event.host).like(like) | func.lower(Event.venue_name).like(like))
    rows = session.exec(stmt.order_by(Event.start).limit(limit * 3 if (category or radius_km) else limit)).all()
    if category:
        rows = [r for r in rows if set(r.categories.split(",")) & set(category)]

    here = (lat, lng) if lat is not None and lng is not None else None
    counts = rsvp_counts(session, [r.id for r in rows])
    mine = set(session.exec(select(EventRsvp.event_id).where(EventRsvp.user_id == user_id)).all()) if user_id else set()
    out = [to_out(r, counts, mine, user_id, here) for r in rows]
    if here:
        if radius_km:
            out = [o for o in out if o.distance_km is not None and o.distance_km <= radius_km]
        out.sort(key=lambda o: (o.distance_km is None, o.distance_km or 0))
    return out[:limit]


@router.get("/geojson")
def events_geojson(events: list[EventOut] = Depends(list_events)) -> dict:
    """Same filters as GET /api/events, as a GeoJSON FeatureCollection (drop straight into a map layer)."""
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "id": e.id,
            "geometry": {"type": "Point", "coordinates": [e.position.lng, e.position.lat]},
            "properties": e.model_dump(by_alias=True, exclude={"position"}),
        } for e in events],
    }


@router.get("/status")
def sources_status(session: Session = Depends(get_session)) -> dict:
    """Which sources are on, when they last synced and how many events each has. Show this in the UI for transparency."""
    out = []
    for s in [*SOURCES]:
        last = session.exec(select(SyncRun).where(SyncRun.source == s.NAME).order_by(SyncRun.finished_at.desc())).first()
        out.append({
            "source": s.NAME,
            "configured": s.configured(),
            "events": session.exec(select(func.count()).select_from(Event).where(Event.source == s.NAME)).one(),
            "lastSync": iso_utc(last.finished_at) if last else None,
            "lastOk": last.ok if last else None,
            "lastError": last.error if last else None,
            "lastFetched": last.fetched if last else None,
            "lastSkippedNoLocation": last.skipped_no_location if last else None,
        })
    community = session.exec(select(func.count()).select_from(Event).where(Event.source == "community")).one()
    out.append({"source": "community", "configured": True, "events": community})
    return {"sources": out, "syncEveryMinutes": settings.events_sync_minutes}


@router.post("/sync")
async def sync_now(_: User = Depends(get_current_user)) -> dict:
    """Pull fresh events from every configured source right now (signed-in users only, to protect API quotas)."""
    runs = await sync_all()
    if not runs:
        raise HTTPException(400, "No event sources configured. Set TICKETMASTER_API_KEY and/or MEETUP_ACCESS_TOKEN in backend/.env")
    return {"runs": [r.model_dump(mode="json") for r in runs]}


@router.get("/{event_id}", response_model=EventOut, response_model_by_alias=True)
def get_event(event_id: int, user_id: int | None = Depends(optional_user_id), session: Session = Depends(get_session)) -> EventOut:
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    mine = {event_id} if user_id and session.get(EventRsvp, (event_id, user_id)) else set()
    return to_out(e, rsvp_counts(session, [event_id]), mine, user_id, None)


@router.post("", response_model=EventOut, response_model_by_alias=True, status_code=201)
async def create_event(body: CommunityEventIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> EventOut:
    """Post a community event (e.g. from a scanned flyer). Needs an address we can find, or a position."""
    from . import classify

    lat, lon = (body.position.lat, body.position.lng) if body.position else (None, None)
    if lat is None and body.address:
        point = await geocode(session, body.address)
        if not point:
            raise HTTPException(422, "We couldn't find that address on the map. Try adding the community or postal code, or drop a pin.")
        lat, lon = point
    if lat is None:
        raise HTTPException(422, "Give an address or a position so the event can go on the map.")
    cats = list(body.categories) or classify.categorize(body.title, body.description, None)
    e = Event(
        source="community",
        source_id=f"u{user.id}-{int(utcnow().timestamp() * 1000)}",
        title=body.title, description=body.description, host=body.host,
        categories=",".join(cats),
        vibe=body.vibe or classify.vibe(body.title, body.description, None),
        languages=",".join(body.languages or ["English"]),
        indoor=body.indoor if body.indoor is not None else classify.indoor(cats, body.title),
        start=body.start,
        end=body.start + timedelta(minutes=body.duration_min) if body.duration_min else None,
        venue_name=body.venue, address=body.address, lat=lat, lon=lon,
        url=body.url, price=body.cost, scanned_from=body.scanned_from, created_by=user.id,
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return to_out(e, {}, set(), user.id, None)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> Response:
    e = session.get(Event, event_id)
    if not e or e.created_by != user.id:
        raise HTTPException(404, "Event not found or not yours")
    session.exec(delete(EventRsvp).where(EventRsvp.event_id == event_id))
    session.delete(e)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{event_id}/rsvp", response_model=EventOut, response_model_by_alias=True)
def rsvp(event_id: int, body: RsvpIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> EventOut:
    """Mark yourself going (optionally looking for a buddy). Call again to change the buddy flag."""
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    r = session.get(EventRsvp, (event_id, user.id)) or EventRsvp(event_id=event_id, user_id=user.id)
    r.looking_for_buddy = body.looking_for_buddy
    session.add(r)
    session.commit()
    return to_out(e, rsvp_counts(session, [event_id]), {event_id}, user.id, None)


@router.delete("/{event_id}/rsvp", response_model=EventOut, response_model_by_alias=True)
def cancel_rsvp(event_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> EventOut:
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    r = session.get(EventRsvp, (event_id, user.id))
    if r:
        session.delete(r)
        session.commit()
    return to_out(e, rsvp_counts(session, [event_id]), set(), user.id, None)
