"""City of Calgary open-data events: the free-text dates must land on the right Calgary times."""

from datetime import datetime, timezone

from app.events import calgary_time
from app.events.sources import calgary


def local(text: str) -> tuple[str, str]:
    start, end = calgary.parse_occurrence(text)
    return calgary_time.local(start).strftime("%Y-%m-%d %H:%M"), calgary_time.local(end).strftime("%Y-%m-%d %H:%M")


def test_time_ranges():
    assert local("Nov 4 2026 9 - 11 a.m.") == ("2026-11-04 09:00", "2026-11-04 11:00")
    assert local("Nov 7 2026 9 a.m. - 12 p.m.") == ("2026-11-07 09:00", "2026-11-07 12:00")
    assert local("Nov 10 2026 10:45 a.m. - 1:15 p.m.") == ("2026-11-10 10:45", "2026-11-10 13:15")
    assert local("Nov 26 2026 1:15 - 3 p.m.") == ("2026-11-26 13:15", "2026-11-26 15:00")
    assert local("Nov 26 2026 11 - 1 p.m.") == ("2026-11-26 11:00", "2026-11-26 13:00")
    assert local("January 28 2027 noon - 1 p.m.") == ("2027-01-28 12:00", "2027-01-28 13:00")
    assert local("Dec 6 2026 7 p.m.") == ("2026-12-06 19:00", "2026-12-06 20:00")
    assert local("Dec 6 2026") == ("2026-12-06 00:00", "2026-12-07 00:00")  # date only: all day
    assert calgary.parse_occurrence("TBA") is None


def test_row_becomes_one_event_per_upcoming_date():
    row = {
        "title": "Coffee, conversations &amp; community - Southland Leisure Centre",
        "notes": "Enjoy a cup of coffee<br>with neighbours.",
        "address": "2000 Southland Drive SW",
        "event_type": "Recreation and leisure",
        "more_info_url": "https://example.calgary.ca/coffee",
        "all_dates": "Nov 4 2026 9 - 11 a.m.<br>Nov 26 2026 11 a.m. - 1 p.m.<br>Mar 25 2027 11 a.m. - 1 p.m.",
        "latitude": "50.97", "longitude": "-114.10",
    }
    now = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
    events = calgary.parse(row, now, days=30)
    assert len(events) == 1  # Nov 4 is over, Mar 25 is past the 30-day window
    e = events[0]
    assert e.title == "Coffee, conversations & community - Southland Leisure Centre"
    assert e.venue_name == "Southland Leisure Centre"
    assert e.description == "Enjoy a cup of coffee\nwith neighbours."
    assert (e.lat, e.lon, e.source, e.host) == (50.97, -114.10, "calgary", "City of Calgary")
    assert e.source_id == calgary.parse(row, now, days=30)[0].source_id  # stable across syncs
    assert calgary._venue("Coffee – Acadia Aquatic & Fitness Centre", "9009 Fairmount Dr SE") == "Acadia Aquatic & Fitness Centre"
    assert calgary._venue("16th Annual Wildflower Art Salon & Sale", "3363 Spruce Dr SW") == "3363 Spruce Dr SW"


def test_alberta_time_is_utc_minus_6_from_march_2026():
    utc = lambda *a: datetime(*a, tzinfo=timezone.utc)  # noqa: E731
    assert calgary_time.to_utc(datetime(2026, 11, 19, 10)) == utc(2026, 11, 19, 16)  # no fall-back in Nov 2026
    assert calgary_time.to_utc(datetime(2027, 1, 15, 12)) == utc(2027, 1, 15, 18)
    assert calgary_time.to_utc(datetime(2025, 11, 19, 10)) == utc(2025, 11, 19, 17)  # old Mountain Standard Time
    assert calgary_time.to_utc(datetime(2025, 7, 1, 12)) == utc(2025, 7, 1, 18)
    assert calgary_time.local(utc(2026, 3, 8, 8, 59)) == datetime(2026, 3, 8, 1, 59)
    assert calgary_time.local(utc(2026, 3, 8, 9)) == datetime(2026, 3, 8, 3, 0)
    assert calgary_time.local(utc(2025, 11, 2, 7, 59)) == datetime(2025, 11, 2, 1, 59)  # last fall-back ever
    assert calgary_time.local(utc(2025, 11, 2, 8)) == datetime(2025, 11, 2, 1, 0)
