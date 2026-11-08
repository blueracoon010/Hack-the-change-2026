"""Plan with friends (busy times, shared free windows, calendar import) and badges from event photos."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.schedule.ics import CALGARY as CAL, busy_times  # noqa: E402
PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"


def _signup(client, name, email):
    r = client.post("/api/auth/signup", json={"name": name, "email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]["id"]


def _friends(client, a, a_id, b, b_id):
    assert client.put(f"/api/social/following/{b_id}", headers=a).status_code == 204
    assert client.put(f"/api/social/following/{a_id}", headers=b).status_code == 204


def _local(day, hour):
    return datetime.combine(day, datetime.min.time(), CAL).replace(hour=hour).isoformat()


def test_ics_reader_handles_repeats_exceptions_and_free_events():
    ics = "\r\n".join([
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT", "UID:a", "DTSTART;TZID=America/Edmonton:20261102T090000", "DTEND;TZID=America/Edmonton:20261102T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", "EXDATE;TZID=America/Edmonton:20261104T090000", "SUMMARY:Secret standup", "END:VEVENT",
        "BEGIN:VEVENT", "UID:b", "DTSTART:20261103T200000Z", "DURATION:PT2H", "TRANSP:TRANSPARENT", "END:VEVENT",  # marked free
        "BEGIN:VEVENT", "UID:c", "DTSTART;VALUE=DATE:20261105", "END:VEVENT",  # all-day
        "BEGIN:VEVENT", "UID:d", "DTSTART:20261106T180000Z", "DTEND:20261106T19", " 0000Z", "END:VEVENT",  # folded line
        "END:VCALENDAR"])
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    got = busy_times(ics, start, start + timedelta(days=14))
    local = [(s.astimezone(CAL).strftime("%a %d %H:%M"), int((e - s).total_seconds() // 60)) for s, e in got]
    assert local == [("Mon 02 09:00", 60), ("Fri 06 12:00", 60), ("Mon 09 09:00", 60), ("Wed 11 09:00", 60)]


def test_friends_free_windows_privacy_and_sharing():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Avery Plan", "avery-plan@example.com")
        b, b_id = _signup(client, "Blake Plan", "blake-plan@example.com")
        c, c_id = _signup(client, "Casey Stranger", "casey-plan@example.com")
        _friends(client, a, a_id, b, b_id)
        assert [f["name"] for f in client.get("/api/schedule/friends", headers=a).json()] == ["Blake Plan"]

        day = (datetime.now(CAL) + timedelta(days=2)).date()
        assert client.post("/api/schedule/blocks", headers=a, json={"start": _local(day, 8), "end": _local(day, 12), "kind": "work", "label": "Shift"}).status_code == 201
        assert client.post("/api/schedule/blocks", headers=b, json={"start": _local(day, 14), "end": _local(day, 18), "kind": "class", "label": "Chem lab"}).status_code == 201
        assert client.post("/api/schedule/blocks", headers=b, json={"start": _local(day, 19), "end": _local(day, 21), "kind": "open"}).status_code == 201
        assert client.post("/api/schedule/blocks", headers=a, json={"start": _local(day, 12), "end": _local(day, 11)}).status_code == 422
        assert client.post("/api/schedule/blocks", headers=a, json={"start": _local(day, 12), "end": _local(day, 13), "kind": "nap"}).status_code == 422

        wk = client.get(f"/api/schedule/week?start={day}&with={b_id},{c_id}", headers=a).json()
        assert [p["name"] for p in wk["people"]] == ["Avery Plan", "Blake Plan"]  # strangers are never included
        mine, blake = wk["people"]
        assert mine["busy"][0]["label"] == "Shift" and mine["busy"][0]["kind"] == "work"
        assert [(x["kind"], "label" in x) for x in blake["busy"]] == [("busy", False), ("open", False)]  # no labels, kind hidden
        today = [w for w in wk["together"] if datetime.fromisoformat(w["start"].replace("Z", "+00:00")).astimezone(CAL).date() == day]
        spans = [(datetime.fromisoformat(w["start"].replace("Z", "+00:00")).astimezone(CAL).hour,
                  datetime.fromisoformat(w["end"].replace("Z", "+00:00")).astimezone(CAL).hour, w["preferred"]) for w in today]
        assert spans == [(12, 14, False), (18, 22, True)]

        # Weekly repeats show up the following week too
        assert client.post("/api/schedule/blocks", headers=a, json={"start": _local(day, 18), "end": _local(day, 19), "repeat_weekly": True}).status_code == 201
        nxt = client.get(f"/api/schedule/week?start={day + timedelta(days=7)}", headers=a).json()
        assert any(x.get("repeat") for x in nxt["people"][0]["busy"])

        # Blake stops sharing: still listed, but no busy times and not counted
        assert client.put("/api/schedule/settings", headers=b, json={"share_with_friends": False}).json()["share_with_friends"] is False
        wk = client.get(f"/api/schedule/week?start={day}&with={b_id}", headers=a).json()
        assert wk["people"][1]["sharing"] is False and wk["people"][1]["busy"] == []

        # Only your own blocks can be removed; export + delete cover schedule data
        block_id = mine["busy"][0]["id"]
        assert client.delete(f"/api/schedule/blocks/{block_id}", headers=b).status_code == 404
        assert client.delete(f"/api/schedule/blocks/{block_id}", headers=a).status_code == 204
        assert client.put("/api/schedule/calendar", headers=a, json={"url": "https://evil.example.com/cal.ics"}).status_code == 422
        r = client.post("/api/schedule/import", headers=a, json={"content": "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:%s\nDTEND:%s\nSUMMARY:Dentist\nEND:VEVENT\nEND:VCALENDAR" % (
            (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y%m%dT%H0000Z"), (datetime.now(timezone.utc) + timedelta(days=1, hours=1)).strftime("%Y%m%dT%H0000Z"))})
        assert r.json() == {"imported": 1}
        export = client.get("/api/users/me/export", headers=a).json()
        assert any(x["source"] == "calendar" and x["label"] == "" for x in export["schedule_blocks"])  # titles never stored
        for h in (a, b, c):
            assert client.delete("/api/users/me", headers=h).status_code == 204


def test_photo_checkins_earn_badges():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Dana Badge", "dana-badge@example.com")
        b, b_id = _signup(client, "Eli Badge", "eli-badge@example.com")
        start = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        ev = client.post("/api/events", headers=b, json={"title": "River clean-up walk", "categories": ["outdoors", "volunteer"], "start": start,
                                                          "durationMin": 90, "position": {"lat": 51.05, "lng": -114.07}}).json()
        future = client.post("/api/events", headers=b, json={"title": "Later thing", "start": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
                                                              "durationMin": 60, "position": {"lat": 51.05, "lng": -114.07}}).json()
        summary = client.get("/api/badges/me", headers=a).json()
        assert summary["attended"] == 0 and summary["earned"] == 0 and summary["next"]["name"] == "First step"

        assert client.post("/api/badges/checkins", headers=a, json={"eventId": ev["id"], "photo": PHOTO}).status_code == 400  # no RSVP
        for e in (ev, future):
            assert client.put(f"/api/events/{e['id']}/rsvp", headers=a, json={}).status_code == 200
        assert [o["id"] for o in client.get("/api/badges/checkin-options", headers=a).json()] == [ev["id"]]
        assert client.post("/api/badges/checkins", headers=a, json={"eventId": future["id"], "photo": PHOTO}).status_code == 400  # not started
        assert client.post("/api/badges/checkins", headers=a, json={"eventId": ev["id"], "photo": "not a photo"}).status_code == 422

        # Eli (a friend) went too: "Better together"
        _friends(client, a, a_id, b, b_id)
        assert client.put(f"/api/events/{ev['id']}/rsvp", headers=b, json={}).status_code == 200
        r = client.post("/api/badges/checkins", headers=a, json={"eventId": ev["id"], "photo": PHOTO})
        assert r.status_code == 201, r.text
        assert {x["id"] for x in r.json()["newBadges"]} == {"first-step", "together", "helping-hand"}  # friend-maker was earned before
        assert client.post("/api/badges/checkins", headers=a, json={"eventId": ev["id"], "photo": PHOTO}).status_code == 409
        assert client.post("/api/badges/checkins", headers=a, json={"title": "Bowness park yoga", "photo": PHOTO}).status_code == 201

        me = client.get("/api/badges/me", headers=a).json()
        assert me["attended"] == 2 and me["next"] == {"name": "Getting out there", "remaining": 1, "icon": "sun"}
        assert me["earned"] == 4
        theirs = client.get(f"/api/badges/user/{a_id}", headers=b).json()  # friends can see earned badges
        assert theirs["earned"] == 4 and all(x["earned"] for x in theirs["badges"])

        # Deleting the event keeps the photo and the badge
        assert client.delete(f"/api/events/{ev['id']}", headers=b).status_code == 204
        photos = client.get("/api/badges/checkins", headers=a).json()
        assert len(photos) == 2 and {p["eventId"] for p in photos} == {None}
        assert client.delete(f"/api/badges/checkins/{photos[0]['id']}", headers=b).status_code == 404
        for h in (a, b):
            assert client.delete("/api/users/me", headers=h).status_code == 204
