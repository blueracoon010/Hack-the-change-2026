"""Calgary local time <-> UTC, without depending on the server's time-zone database.

Alberta stopped changing its clocks: after springing forward on March 8, 2026 it stays on UTC-6 ("Alberta Time")
all year. Older time-zone data (some Docker images, Windows machines without the update) still expects a fall-back
to UTC-7 in November, which would put every event an hour off. The rule is simple enough to write down here.
Same rule as calgaryOffsetMin() in frontend/src/lib/nexus.ts.
"""

from datetime import datetime, timedelta, timezone

PERMANENT_FROM = datetime(2026, 3, 8, 9, tzinfo=timezone.utc)  # 2 a.m. MST, March 8, 2026


def _nth_sunday(year: int, month: int, n: int) -> int:
    first = datetime(year, month, 1).weekday()  # Monday = 0
    return 1 + (6 - first) % 7 + 7 * (n - 1)


def offset(moment: datetime) -> timedelta:
    """Calgary's UTC offset at an aware moment."""
    t = moment.astimezone(timezone.utc)
    if t >= PERMANENT_FROM:
        return timedelta(hours=-6)
    dst_start = datetime(t.year, 3, _nth_sunday(t.year, 3, 2), 9, tzinfo=timezone.utc)  # 2 a.m. MST
    dst_end = datetime(t.year, 11, _nth_sunday(t.year, 11, 1), 8, tzinfo=timezone.utc)  # 2 a.m. MDT
    return timedelta(hours=-6) if dst_start <= t < dst_end else timedelta(hours=-7)


def to_utc(wall: datetime) -> datetime:
    """A naive Calgary wall-clock time -> aware UTC. Offset applied twice so daylight-saving changeovers land right."""
    guess = wall.replace(tzinfo=timezone.utc)
    first = guess - offset(guess)
    return guess - offset(first)


def local(moment: datetime) -> datetime:
    """Aware moment -> naive Calgary wall-clock time."""
    t = moment.astimezone(timezone.utc)
    return (t + offset(t)).replace(tzinfo=None)
