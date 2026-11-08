"""Wants company: friends who asked for a buddy are named, strangers are only a count, and "I'll go with you" pairs people."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.test_schedule_badges import _friends, _signup  # noqa: E402


def test_wants_company_friends_named_strangers_counted_and_go_with():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Ari Buddy", "ari-buddy@example.com")
        b, b_id = _signup(client, "Bo Buddy", "bo-buddy@example.com")
        c, c_id = _signup(client, "Cy Stranger", "cy-buddy@example.com")
        _friends(client, a, a_id, b, b_id)
        soon = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        ev = client.post("/api/events", headers=a, json={"title": "Pottery night", "start": soon, "position": {"lat": 51.04, "lng": -114.07}}).json()["id"]

        # Ari (friend) and Cy (stranger) both ask for a buddy.
        assert client.put(f"/api/events/{ev}/rsvp", headers=a, json={"lookingForBuddy": True}).status_code == 200
        assert client.put(f"/api/events/{ev}/rsvp", headers=c, json={"lookingForBuddy": True}).status_code == 200

        wanted = {w["eventId"]: w for w in client.get("/api/buddies/wanted", headers=b).json()}
        assert wanted[ev]["friends"] == [{"id": a_id, "name": "Ari Buddy"}]
        assert wanted[ev]["others"] == 1  # Cy, never named

        detail = client.get(f"/api/buddies/events/{ev}", headers=b).json()
        assert [f["name"] for f in detail["friends"]] == ["Ari Buddy"] and detail["others"] == 1

        # Bo can't "go with" a stranger, but can go with a friend.
        assert client.post(f"/api/buddies/events/{ev}/go-with/{c_id}", headers=b).status_code == 404
        r = client.post(f"/api/buddies/events/{ev}/go-with/{a_id}", headers=b)
        assert r.status_code == 200 and r.json()["friends"][0]["withMe"] is True
        assert client.get(f"/api/events/{ev}", headers=b).json()["meGoing"] is True  # going with means RSVP'd

        # Ari sees who answered.
        assert client.get(f"/api/buddies/events/{ev}", headers=a).json()["companions"] == [{"id": b_id, "name": "Bo Buddy"}]

        # Ari drops the request: the pair goes, and Bo no longer sees Ari wanting company.
        client.put(f"/api/events/{ev}/rsvp", headers=a, json={"lookingForBuddy": False})
        assert client.get(f"/api/buddies/events/{ev}", headers=a).json()["companions"] == []
        assert all(w["eventId"] != ev or not w["friends"] for w in client.get("/api/buddies/wanted", headers=b).json())

        # Deleting the event clears its buddy pairs too (and keeps the shared test DB clean).
        assert client.delete(f"/api/events/{ev}", headers=a).status_code == 204
