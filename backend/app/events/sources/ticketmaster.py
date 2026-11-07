"""Ticketmaster Discovery API v2: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

Free key, 5000 calls/day, 5/s. Venues come with lat/lon, so no geocoding needed.
Paging limit: size * page must stay under 1000, so we read at most 5 pages of 200.
"""

from datetime import datetime, timedelta, timezone

import httpx

from ...config import settings
from ..schemas import EventIn

NAME = "ticketmaster"
URL = "https://app.ticketmaster.com/discovery/v2/events.json"


def configured() -> bool:
    return bool(settings.ticketmaster_api_key)


def _parse_dt(dates: dict, key: str) -> datetime | None:
    part = dates.get(key) or {}
    if part.get("dateTime"):
        return datetime.fromisoformat(part["dateTime"].replace("Z", "+00:00"))
    if part.get("localDate"):  # date only (TBA time): assume local noon-ish; marked by the source
        local = f'{part["localDate"]}T{part.get("localTime") or "12:00:00"}'
        tz = timezone(timedelta(hours=-7))  # Mountain; only used when Ticketmaster gives no UTC time
        return datetime.fromisoformat(local).replace(tzinfo=tz)
    return None


def parse(ev: dict) -> EventIn | None:
    start = _parse_dt(ev.get("dates", {}), "start")
    if not start:
        return None
    venue = ((ev.get("_embedded") or {}).get("venues") or [{}])[0]
    loc = venue.get("location") or {}
    addr = ", ".join(p for p in [
        (venue.get("address") or {}).get("line1"),
        (venue.get("city") or {}).get("name"),
        (venue.get("state") or {}).get("stateCode"),
        venue.get("postalCode"),
    ] if p)
    cls = (ev.get("classifications") or [{}])[0]
    labels = [(cls.get(k) or {}).get("name") for k in ("segment", "genre", "subGenre")]
    raw_category = " / ".join(l for l in labels if l and l != "Undefined") or None
    images = sorted(ev.get("images") or [], key=lambda i: i.get("width", 0), reverse=True)
    pr = (ev.get("priceRanges") or [None])[0]
    price = f'${pr["min"]:.0f}-${pr["max"]:.0f} {pr.get("currency", "")}'.strip() if pr and "min" in pr and "max" in pr else None
    return EventIn(
        source=NAME,
        source_id=ev["id"],
        title=ev.get("name", "Untitled event"),
        start=start,
        end=_parse_dt(ev.get("dates", {}), "end"),
        description=ev.get("info") or ev.get("pleaseNote"),
        host=(ev.get("promoter") or {}).get("name") or venue.get("name"),
        raw_category=raw_category,
        scanned_from="Ticketmaster",
        venue_name=venue.get("name"),
        address=addr or None,
        lat=float(loc["latitude"]) if loc.get("latitude") else None,
        lon=float(loc["longitude"]) if loc.get("longitude") else None,
        url=ev.get("url"),
        image_url=images[0]["url"] if images else None,
        price=price,
    )


async def fetch(lat: float, lon: float, radius_km: float, days: int) -> list[EventIn]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    params = {
        "apikey": settings.ticketmaster_api_key,
        "latlong": f"{lat},{lon}",
        "radius": str(int(radius_km)),
        "unit": "km",
        "size": "200",
        "sort": "date,asc",
        "startDateTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateTime": (now + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    out: list[EventIn] = []
    async with httpx.AsyncClient(timeout=20) as client:
        for page in range(5):
            r = await client.get(URL, params={**params, "page": str(page)})
            if r.status_code == 401:
                raise RuntimeError("Ticketmaster rejected the API key (401). Check TICKETMASTER_API_KEY.")
            r.raise_for_status()
            data = r.json()
            out += [e for e in (parse(ev) for ev in (data.get("_embedded") or {}).get("events", [])) if e]
            if page + 1 >= (data.get("page") or {}).get("totalPages", 0):
                break
    return out
