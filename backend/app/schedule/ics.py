"""A small iCalendar (.ics) reader: just enough to turn a Google / Outlook / Apple calendar into busy times.

Handles single and repeating events (daily / weekly RRULE with INTERVAL, COUNT, UNTIL, BYDAY), EXDATE,
moved instances (RECURRENCE-ID), cancelled events, and events marked "free" (TRANSP:TRANSPARENT).
All-day events are skipped (birthdays and holidays shouldn't block a whole day). Titles are never returned.
"""

import re
from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

from ..events import calgary_time


class CalgaryTZ(tzinfo):
    """Calgary time using the app's own rule (events/calgary_time.py: UTC-6 all year since March 2026),
    so we don't depend on how up to date this machine's time-zone database is."""

    def utcoffset(self, dt):
        return calgary_time.offset(calgary_time.to_utc(dt.replace(tzinfo=None))) if dt is not None else timedelta(hours=-6)

    def dst(self, dt):
        return timedelta(0)

    def tzname(self, dt):
        return "Calgary"

    def fromutc(self, dt):
        return (dt.replace(tzinfo=None) + calgary_time.offset(dt.replace(tzinfo=timezone.utc))).replace(tzinfo=self)

    def __repr__(self):
        return "Calgary"


CALGARY = CalgaryTZ()
_CALGARY_NAMES = {"America/Edmonton", "America/Calgary", "Canada/Mountain", "Mountain Standard Time", "US/Mountain"}
_DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
_DURATION = re.compile(r"^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")
MAX_OCCURRENCES = 2000  # per repeating event, so a malformed rule can't run forever


def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw:
            lines.append(raw)
    return lines


def _split(line: str) -> tuple[str, dict[str, str], str]:
    head, _, value = line.partition(":")
    name, *params = head.split(";")
    return name.upper(), {k.upper(): v.strip('"') for k, _, v in (p.partition("=") for p in params)}, value


def _parse_dt(value: str, params: dict[str, str]) -> datetime | date | None:
    value = value.strip()
    try:
        if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
            return datetime.strptime(value[:8], "%Y%m%d").date()
        dt = datetime.strptime(value.rstrip("Z")[:15], "%Y%m%dT%H%M%S")
    except ValueError:
        return None
    if value.endswith("Z"):
        return dt.replace(tzinfo=timezone.utc)
    try:
        tz = ZoneInfo(params["TZID"]) if params.get("TZID", "America/Edmonton") not in _CALGARY_NAMES else CALGARY
    except Exception:  # unknown / Windows-style TZID names: assume Calgary
        tz = CALGARY
    return dt.replace(tzinfo=tz)


def _duration(value: str) -> timedelta | None:
    m = _DURATION.match(value.strip())
    if not m:
        return None
    sign, w, d, h, mi, s = m.groups()
    delta = timedelta(weeks=int(w or 0), days=int(d or 0), hours=int(h or 0), minutes=int(mi or 0), seconds=int(s or 0))
    return -delta if sign == "-" else delta


def _key(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S")


def _occurrences(start: datetime, rule: str, until_window: datetime):
    parts = dict(p.partition("=")[::2] for p in rule.upper().split(";") if "=" in p)
    freq = parts.get("FREQ")
    if freq not in ("DAILY", "WEEKLY"):
        yield start  # monthly / yearly repeats: keep the first occurrence only
        return
    interval = max(1, int(parts.get("INTERVAL", "1") or 1))
    count = int(parts["COUNT"]) if parts.get("COUNT", "").isdigit() else None
    until = None
    if "UNTIL" in parts:
        u = _parse_dt(parts["UNTIL"], {"TZID": getattr(start.tzinfo, "key", "America/Edmonton")} if not parts["UNTIL"].endswith("Z") else {})
        until = datetime.combine(u, datetime.max.time(), start.tzinfo) if isinstance(u, date) and not isinstance(u, datetime) else u
    days = sorted(_DAYS[d[-2:]] for d in parts.get("BYDAY", "").split(",") if d[-2:] in _DAYS) or [start.weekday()]
    emitted = 0
    if freq == "DAILY":
        step = timedelta(days=interval)
        candidates = (start + step * i for i in range(MAX_OCCURRENCES))
    else:
        week0 = start - timedelta(days=start.weekday())

        def weekly():
            for w in range(0, MAX_OCCURRENCES * interval, interval):
                for d in days:
                    yield week0 + timedelta(weeks=w, days=d)
        candidates = weekly()
    for occ in candidates:
        # Wall-clock time stays the same across daylight-saving changes.
        occ = occ.replace(tzinfo=start.tzinfo)
        if occ < start:
            continue
        if (until and occ > until) or (count is not None and emitted >= count) or occ > until_window or emitted >= MAX_OCCURRENCES:
            return
        emitted += 1
        yield occ


def busy_times(text: str, window_start: datetime, window_end: datetime) -> list[tuple[datetime, datetime]]:
    """(start, end) in UTC for every busy occurrence that overlaps the window."""
    events: list[dict] = []
    current: dict | None = None
    for line in _unfold(text):
        name, params, value = _split(line)
        if name == "BEGIN" and value.upper() == "VEVENT":
            current = {"exdates": set()}
        elif name == "END" and value.upper() == "VEVENT":
            if current is not None:
                events.append(current)
            current = None
        elif current is not None:
            if name in ("DTSTART", "DTEND", "RECURRENCE-ID"):
                current[name] = _parse_dt(value, params)
            elif name == "EXDATE":
                for v in value.split(","):
                    dt = _parse_dt(v, params)
                    if isinstance(dt, datetime):
                        current["exdates"].add(_key(dt))
            elif name in ("RRULE", "DURATION", "UID", "STATUS", "TRANSP"):
                current[name] = value.strip()

    # Instances that were moved or cancelled individually replace their slot in the repeating series.
    moved: dict[str, set[str]] = {}
    for e in events:
        if isinstance(e.get("RECURRENCE-ID"), datetime):
            moved.setdefault(e.get("UID", ""), set()).add(_key(e["RECURRENCE-ID"]))

    out: list[tuple[datetime, datetime]] = []
    for e in events:
        start = e.get("DTSTART")
        if not isinstance(start, datetime):
            continue  # all-day or unreadable
        if e.get("STATUS", "").upper() == "CANCELLED" or e.get("TRANSP", "").upper() == "TRANSPARENT":
            continue
        end = e.get("DTEND")
        length = (end - start) if isinstance(end, datetime) else (_duration(e.get("DURATION", "")) or timedelta(hours=1))
        if length <= timedelta(0) or length > timedelta(days=2):
            continue
        skip = e["exdates"] | (moved.get(e.get("UID", ""), set()) if "RECURRENCE-ID" not in e else set())
        starts = _occurrences(start, e["RRULE"], window_end) if e.get("RRULE") and "RECURRENCE-ID" not in e else [start]
        for occ in starts:
            if _key(occ) in skip:
                continue
            s, f = occ.astimezone(timezone.utc), (occ + length).astimezone(timezone.utc)
            if f > window_start and s < window_end:
                out.append((s, f))
    return sorted(out)
