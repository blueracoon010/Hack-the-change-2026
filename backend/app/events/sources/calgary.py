"""City of Calgary Events (open data): https://data.calgary.ca/resource/n625-9k5x

Free, no key (CALGARY_APP_TOKEN only raises rate limits). Public meetings, engagement sessions, recreation
drop-ins and community events. Every row already has coordinates, so no geocoding is needed. The City refreshes
the file twice a day.

Dates come as text, one line per occurrence:
    "Nov 10 2026 10:45 a.m. - 1:15 p.m.<br>Dec 15 2026 10:45 a.m. - 1:15 p.m."
Each occurrence becomes its own event on the map.
"""

import hashlib
import html
import re
from datetime import date, datetime, timedelta, timezone

import httpx

from ...config import settings
from .. import calgary_time
from ..schemas import EventIn

NAME = "calgary"
URL = "https://data.calgary.ca/resource/n625-9k5x.json"

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_TIME = r"(?:(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?|(noon|midnight))"
_OCCURRENCE = re.compile(rf"^([A-Za-z]{{3}})[a-z]*\.?\s+(\d{{1,2}}),?\s+(\d{{4}})\s*(?:{_TIME}(?:\s*[-–]\s*{_TIME})?)?\s*$", re.I)
_VENUE_WORDS = re.compile(r"\b(centre|center|library|park|hall|arena|pool|school|church|club|museum|leisure|recreation)\b", re.I)


def configured() -> bool:
    return settings.calgary_events  # open data, no key: on unless CALGARY_EVENTS=0


def _minutes(hour: str | None, minute: str | None, period: str | None, word: str | None) -> tuple[int | None, str | None]:
    """-> (minutes after midnight, "am"/"pm"/None). Period None means "same as the other end of the range"."""
    if word:
        return (0, "pm") if word.lower() == "noon" else (0, "am")  # 12 p.m. / 12 a.m.: the period adds the 12 hours
    if hour is None:
        return None, None
    p = period.replace(".", "").lower() if period else None
    return int(hour) % 12 * 60 + int(minute or 0), p


def parse_occurrence(text: str) -> tuple[datetime, datetime] | None:
    """'Nov 4 2026 9 - 11 a.m.' -> (start, end) in UTC. Date only -> the whole day."""
    m = _OCCURRENCE.match(" ".join(html.unescape(text).split()))
    if not m or m.group(1).lower()[:3] not in MONTHS:
        return None
    day = date(int(m.group(3)), MONTHS[m.group(1).lower()[:3]], int(m.group(2)))
    midnight = datetime(day.year, day.month, day.day)  # Calgary wall clock, made UTC on the way out
    start, sp = _minutes(m.group(4), m.group(5), m.group(6), m.group(7))
    end, ep = _minutes(m.group(8), m.group(9), m.group(10), m.group(11))
    if start is None:
        return _utc(midnight, 0, 24 * 60)  # no time given: all day
    sp = sp or ep or ("pm" if 1 <= start // 60 < 7 else "am")  # "1 - 3" with no period: afternoon
    start += 12 * 60 if sp == "pm" else 0
    if end is None:
        return _utc(midnight, start, start + 60)
    end += 12 * 60 if (ep or sp) == "pm" else 0
    if not m.group(6) and not m.group(7) and start > end:  # "11 - 1 p.m." means 11 a.m. to 1 p.m.
        start -= 12 * 60
    if end <= start:
        end += 24 * 60  # runs past midnight
    return _utc(midnight, start, end)


def _utc(midnight: datetime, start: int, end: int) -> tuple[datetime, datetime]:
    return calgary_time.to_utc(midnight + timedelta(minutes=start)), calgary_time.to_utc(midnight + timedelta(minutes=end))


def _clean(text: str | None) -> str | None:
    if not text:
        return None
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return "\n".join(" ".join(line.split()) for line in text.splitlines()).strip() or None


def _venue(title: str, address: str | None) -> str | None:
    """Titles often end with the place: 'Coffee, conversations & community - Bob Bahan Aquatic & Fitness Centre'."""
    parts = re.split(r"\s[-–—]\s", title)
    tail = parts[-1] if len(parts) > 1 else ""
    return tail if tail and _VENUE_WORDS.search(tail) else address


def parse(row: dict, now: datetime, days: int) -> list[EventIn]:
    title = _clean(row.get("title"))
    try:
        lat, lon = float(row["latitude"]), float(row["longitude"])
    except (KeyError, TypeError, ValueError):
        lat = lon = None
    if not title:
        return []
    address = _clean(row.get("address"))
    # Stable id: the City republishes the whole file, so its row ids can change. Title + place + link don't.
    key = hashlib.sha1(f'{title}|{address}|{row.get("more_info_url")}'.encode()).hexdigest()[:12]
    out: list[EventIn] = []
    for occurrence in re.split(r"<br\s*/?>|\n", row.get("all_dates") or row.get("next_date_times") or "", flags=re.I):
        times = parse_occurrence(occurrence) if occurrence.strip() else None
        if not times:
            continue
        start, end = times
        if end < now or start > now + timedelta(days=days):
            continue
        out.append(EventIn(
            source=NAME,
            source_id=f"{key}-{start.strftime('%Y%m%d%H%M')}",
            title=title,
            start=start,
            end=end,
            description=_clean(row.get("notes")),
            host=_clean(row.get("host_organization")) or "City of Calgary",
            raw_category=row.get("event_type"),
            scanned_from="City of Calgary",
            venue_name=_venue(title, address),
            address=address,
            lat=lat,
            lon=lon,
            price="Free" if re.search(r"\bfree\b", f"{title} {row.get('notes') or ''}", re.I) else None,
            url=row.get("more_info_url") if isinstance(row.get("more_info_url"), str) else (row.get("more_info_url") or {}).get("url"),
        ))
    return out


async def fetch(lat: float, lon: float, radius_km: float, days: int) -> list[EventIn]:
    headers = {"X-App-Token": settings.calgary_app_token} if settings.calgary_app_token else {}
    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        r = await client.get(URL, params={"$limit": "5000"})
        r.raise_for_status()
        rows = r.json()
    now = datetime.now(timezone.utc)
    return [e for row in rows for e in parse(row, now, days)]
