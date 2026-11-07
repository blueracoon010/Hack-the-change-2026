"""Events -> map API. Run from backend/: python -m pytest -q  (no network: uses community events + a parser check)."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/events.db"
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
