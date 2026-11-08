"""Events -> map API. Run from backend/: python -m pytest -q  (no network: uses community events + a parser check)."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/events.db")
os.environ["TICKETMASTER_API_KEY"] = ""
os.environ["MEETUP_ACCESS_TOKEN"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.events import classify  # noqa: E402
from app.events.sources import ticketmaster  # noqa: E402
from app.main import app  # noqa: E402


def _signup(client, email):
    r = client.post("/api/auth/signup", json={"name": "T", "email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_community_events_map_flow():
    soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    with TestClient(app) as client:
        auth = _signup(client, "host@example.com")
        assert client.post("/api/events", json={"title": "No place", "start": soon}, headers=auth).status_code == 422
        assert client.post("/api/events", json={"title": "Signed out", "start": soon, "position": {"lat": 51, "lng": -114}}).status_code == 401

        near = client.post("/api/events", headers=auth, json={
            "title": "Silent book club", "start": soon, "durationMin": 90, "venue": "Mission Hall",
            "position": {"lat": 51.0331, "lng": -114.0745}, "languages": ["English", "Français"], "scannedFrom": "Library board",
        })
        assert near.status_code == 201, near.text
        body = near.json()
        assert body["categories"] and body["vibe"] == "introvert" and body["durationMin"] == 90 and body["mine"]
        far = client.post("/api/events", headers=auth, json={
            "title": "Pickleball tournament", "start": soon, "position": {"lat": 51.17, "lng": -114.11}, "categories": ["sports"],
        }).json()

        # every NexusEvent field is present
        ev = client.get("/api/events").json()
        assert len(ev) == 2
        for key in ["id", "title", "host", "categories", "vibe", "start", "durationMin", "venue", "address", "position",
                    "cost", "indoor", "going", "lookingForBuddy", "languages", "description", "scannedFrom"]:
            assert key in ev[0], key

        # nearest first + radius + bbox + category filters
        ranked = client.get("/api/events", params={"lat": 51.04, "lng": -114.07}).json()
        assert [e["id"] for e in ranked] == [body["id"], far["id"]] and ranked[0]["distanceKm"] < 2
        assert len(client.get("/api/events", params={"lat": 51.04, "lng": -114.07, "radiusKm": 5}).json()) == 1
        assert len(client.get("/api/events", params={"bbox": "-114.2,51.0,-114.0,51.1"}).json()) == 1
        assert [e["title"] for e in client.get("/api/events", params={"category": "sports"}).json()] == ["Pickleball tournament"]

        # RSVP counts are real
        other = _signup(client, "guest@example.com")
        r = client.put(f"/api/events/{body['id']}/rsvp", json={"lookingForBuddy": True}, headers=other).json()
        assert r["going"] == 1 and r["lookingForBuddy"] == 1 and r["meGoing"]
        assert client.get(f"/api/events/{body['id']}").json()["going"] == 1

        geo = client.get("/api/events/geojson").json()
        assert geo["type"] == "FeatureCollection" and len(geo["features"]) == 2
        status = {s["source"]: s for s in client.get("/api/events/status").json()["sources"]}
        assert status["ticketmaster"]["configured"] is False and status["community"]["events"] == 2
        assert client.post("/api/events/sync", headers=auth).status_code == 400  # no keys -> no fake data

        # privacy: export + delete account removes their events and RSVPs
        assert len(client.get("/api/users/me/export", headers=auth).json()["events_posted"]) == 2
        assert client.delete(f"/api/events/{far['id']}", headers=other).status_code == 404  # not theirs
        assert client.delete("/api/users/me", headers=auth).status_code == 204
        assert client.get("/api/events").json() == []


def test_ticketmaster_parser_and_classifier():
    # Shape from the Discovery API v2 docs (trimmed), not real event data.
    raw = {
        "id": "abc", "name": "Calgary Hitmen vs. Oil Kings", "url": "https://www.ticketmaster.ca/event/abc",
        "dates": {"start": {"localDate": "2026-11-20", "localTime": "19:00:00", "dateTime": "2026-11-21T02:00:00Z"}},
        "classifications": [{"segment": {"name": "Sports"}, "genre": {"name": "Hockey"}}],
        "_embedded": {"venues": [{"name": "Scotiabank Saddledome", "address": {"line1": "555 Saddledome Rise SE"},
                                   "city": {"name": "Calgary"}, "state": {"stateCode": "AB"},
                                   "location": {"latitude": "51.0374", "longitude": "-114.0519"}}]},
    }
    e = ticketmaster.parse(raw)
    assert e.lat == 51.0374 and e.start == datetime(2026, 11, 21, 2, 0, tzinfo=timezone.utc) and e.scanned_from == "Ticketmaster"
    assert classify.categorize(e.title, None, e.raw_category)[0] == "sports"
    assert classify.vibe("Yoga for beginners", "small group", None) == "introvert"
    assert classify.vibe("Live music festival", None, "Music") == "extrovert"


def _user_id(client, auth):
    return client.get("/api/auth/me", headers=auth).json()["id"]


def test_private_events_are_friends_only():
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    with TestClient(app) as client:
        host = _signup(client, "private-host@example.com")
        friend = _signup(client, "private-friend@example.com")
        fan = _signup(client, "private-fan@example.com")  # follows the host, not followed back
        stranger = _signup(client, "private-stranger@example.com")
        host_id, friend_id = _user_id(client, host), _user_id(client, friend)

        # host <-> friend follow each other (friends); fan only follows the host
        fan_id = _user_id(client, fan)
        assert client.put(f"/api/social/following/{friend_id}", headers=host).status_code == 204
        assert client.post(f"/api/social/requests/{host_id}/accept", headers=friend).status_code == 204
        assert client.put(f"/api/social/following/{host_id}", headers=friend).status_code == 204
        assert client.put(f"/api/social/following/{host_id}", headers=fan).status_code == 204
        for requester in (friend_id, fan_id):
            assert client.post(f"/api/social/requests/{requester}/accept", headers=host).status_code == 204

        where = {"position": {"lat": 51.05, "lng": -114.07}}
        pub = client.post("/api/events", headers=host, json={"title": "Open garden day", "start": soon, **where}).json()
        priv = client.post("/api/events", headers=host, json={"title": "Birthday picnic", "start": soon, "visibility": "private", **where})
        assert priv.status_code == 201 and priv.json()["visibility"] == "private"
        priv = priv.json()
        assert pub["visibility"] == "public"

        titles = lambda auth=None: {e["title"] for e in client.get("/api/events", headers=auth or {}).json()}  # noqa: E731
        assert titles(host) >= {"Open garden day", "Birthday picnic"}
        assert "Birthday picnic" in titles(friend)
        for outsider in (fan, stranger, None):
            assert "Birthday picnic" not in titles(outsider) and "Open garden day" in titles(outsider)

        # the private event can't be opened or RSVP'd by someone who isn't a friend
        assert client.get(f"/api/events/{priv['id']}", headers=stranger).status_code == 404
        assert client.get(f"/api/events/{priv['id']}").status_code == 404
        assert client.put(f"/api/events/{priv['id']}/rsvp", json={}, headers=fan).status_code == 404
        assert client.put(f"/api/events/{priv['id']}/rsvp", json={}, headers=friend).json()["going"] == 1

        # My events: everything you created, private included; nobody else's
        mine = client.get("/api/events/mine", headers=host).json()
        assert {e["title"] for e in mine} == {"Open garden day", "Birthday picnic"} and all(e["mine"] for e in mine)
        assert client.get("/api/events/mine", headers=friend).json() == []
        assert client.get("/api/events/mine").status_code == 401

        # unfollowing ends the friendship, and with it access
        assert client.delete(f"/api/social/following/{host_id}", headers=friend).status_code == 204
        assert "Birthday picnic" not in titles(friend)

def test_attendance_calendar_and_export():
    with TestClient(app) as client:
        host = _signup(client, 'calendar-host@example.com')
        guest = _signup(client, 'calendar-guest@example.com')
        other = _signup(client, 'calendar-other@example.com')
        host_id, guest_id = _user_id(client, host), _user_id(client, guest)
        client.put(f'/api/social/following/{guest_id}', headers=host)
        client.post(f'/api/social/requests/{host_id}/accept', headers=guest)
        client.put(f'/api/social/following/{host_id}', headers=guest)
        client.post(f'/api/social/requests/{guest_id}/accept', headers=host)
        soon = datetime.now(timezone.utc) + timedelta(days=60)
        def create(title, start, visibility='public', duration=90):
            r = client.post('/api/events', headers=host, json={'title': title, 'start': start.isoformat(), 'durationMin': duration, 'visibility': visibility, 'description': 'First line\nSecond; comma, slash \\ and café', 'venue': 'Library', 'position': {'lat': 51.04, 'lng': -114.07}})
            assert r.status_code == 201, r.text
            return r.json()['id']
        public = create('Calendar: coffee, books; ' + 'é' * 40, soon)
        private = create('Calendar private plan', soon + timedelta(days=1), 'private')
        past = create('Calendar past plan', soon - timedelta(days=70))
        only_other = create('Calendar someone else', soon + timedelta(days=2))
        for event_id in (public, private, past):
            assert client.put(f'/api/events/{event_id}/rsvp', headers=guest, json={}).status_code == 200
        client.put(f'/api/events/{only_other}/rsvp', headers=other, json={})
        assert client.get('/api/events/attending').status_code == 401
        assert client.get('/api/events/attending/calendar.ics').status_code == 401
        attending = client.get('/api/events/attending', headers=guest).json()
        assert {e['id'] for e in attending} == {public, private, past}
        assert all(e['meGoing'] for e in attending)
        assert client.get('/api/events/attending', headers=host).json() == []
        response = client.get('/api/events/attending/calendar.ics', headers=guest)
        assert response.status_code == 200 and response.headers['content-type'].startswith('text/calendar')
        assert response.headers['cache-control'] == 'no-store'
        content = response.content.decode('utf-8')
        assert content.endswith('END:VCALENDAR\r\n')
        assert content.count('BEGIN:VEVENT') == 2
        assert all(len(line.encode('utf-8')) <= 75 for line in content.split('\r\n'))
        unfolded = content.replace('\r\n ', '')
        assert 'SUMMARY:Calendar: coffee\\, books\\;' in unfolded
        assert 'First line\\nSecond\\; comma\\, slash \\\\ and café' in unfolded
        assert f'DTSTART:{soon.strftime("%Y%m%dT%H%M%SZ")}' in unfolded
        assert f'DTEND:{(soon + timedelta(minutes=90)).strftime("%Y%m%dT%H%M%SZ")}' in unfolded
        assert f'UID:nexus-event-{public}@nexus.local' in unfolded
        assert 'Calendar past plan' not in unfolded and 'Calendar someone else' not in unfolded
        # Cancelled attendance and revoked private-event access disappear from both views.
        client.delete(f'/api/events/{public}/rsvp', headers=guest)
        client.delete(f'/api/social/following/{host_id}', headers=guest)
        assert {e['id'] for e in client.get('/api/events/attending', headers=guest).json()} == {past}
        assert 'BEGIN:VEVENT' not in client.get('/api/events/attending/calendar.ics', headers=guest).text
        for auth in (host, guest, other):
            assert client.delete('/api/users/me', headers=auth).status_code == 204
