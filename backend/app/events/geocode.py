"""Address -> (lat, lon) with OpenStreetMap Nominatim, cached forever in the GeocodeCache table.

Nominatim's policy: max 1 request/second, identifying User-Agent, cache results. We do all three.
Results are biased to the Calgary area (viewbox) so "100 Main St" doesn't land in another city.
"""

import asyncio
import time

import httpx
from sqlmodel import Session

from ..config import settings
from .models import GeocodeCache

NOMINATIM = "https://nominatim.openstreetmap.org/search"
_lock = asyncio.Lock()
_last_call = 0.0


def _key(address: str) -> str:
    return " ".join(address.lower().split())


async def geocode(session: Session, address: str) -> tuple[float, float] | None:
    key = _key(address)
    if not key:
        return None
    cached = session.get(GeocodeCache, key)
    if cached:
        return (cached.lat, cached.lon) if cached.lat is not None else None

    global _last_call
    d = 0.5  # ~55 km box around the events centre
    lat0, lon0 = settings.events_center_lat, settings.events_center_lon
    params = {
        "q": address, "format": "jsonv2", "limit": "1", "countrycodes": "ca",
        "viewbox": f"{lon0 - d},{lat0 + d},{lon0 + d},{lat0 - d}",
    }
    async with _lock:  # serialises calls so we never exceed 1/s
        wait = 1.05 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": settings.geocoder_user_agent}) as client:
                r = await client.get(NOMINATIM, params=params)
            r.raise_for_status()
            hits = r.json()
        except httpx.HTTPError:
            return None  # network problem: don't cache, try again next sync
        finally:
            _last_call = time.monotonic()

    point = (float(hits[0]["lat"]), float(hits[0]["lon"])) if hits else None
    session.add(GeocodeCache(query=key, lat=point[0] if point else None, lon=point[1] if point else None))
    session.commit()
    return point
