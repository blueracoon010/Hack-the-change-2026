"""The demo seed script runs end to end and cleans up after itself."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from scripts import seed_demo  # noqa: E402
from tests.test_schedule_badges import _signup  # noqa: E402


def test_seed_demo_creates_friend_buddy_request_and_dm_then_removes():
    with TestClient(app) as client:
        me, _ = _signup(client, "Demo Viewer", "demo-viewer@example.com")
        soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        ev = client.post("/api/events", headers=me, json={"title": "Board game night", "start": soon, "position": {"lat": 51.05, "lng": -114.07}}).json()["id"]
        seed_demo.seed("demo-viewer@example.com", int(ev))
        wanted = {w["eventId"]: w for w in client.get("/api/buddies/wanted", headers=me).json()}
        assert [f["name"] for f in wanted[ev]["friends"]] == ["Maya Chen"] and wanted[ev]["others"] == 1
        assert client.get("/api/dm/unread", headers=me).json()["unread"] == 1
        seed_demo.remove()
        assert client.get("/api/buddies/wanted", headers=me).json() == []
        assert client.get("/api/dm/unread", headers=me).json()["unread"] == 0
        client.delete(f"/api/events/{ev}", headers=me)
