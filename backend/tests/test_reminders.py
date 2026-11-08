"""'Remind me the day before' sends one email per person per event, only for events in the next 24 hours."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session  # noqa: E402

from app.db import engine  # noqa: E402
from app.events import reminders  # noqa: E402
from app.main import app  # noqa: E402
from tests.test_schedule_badges import _signup  # noqa: E402


def test_reminders_sent_once_for_tomorrows_events(monkeypatch):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(reminders, "send_email", lambda to, subject, body: sent.append((to, subject)))
    with TestClient(app) as client:
        me, _ = _signup(client, "Remi Nder", "remi-reminder@example.com")
        soon = (datetime.now(timezone.utc) + timedelta(hours=20)).isoformat()
        later = (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()
        e1 = client.post("/api/events", headers=me, json={"title": "Soup night", "start": soon, "position": {"lat": 51.05, "lng": -114.07}}).json()["id"]
        e2 = client.post("/api/events", headers=me, json={"title": "Far off", "start": later, "position": {"lat": 51.05, "lng": -114.07}}).json()["id"]
        for ev in (e1, e2):
            assert client.put(f"/api/events/{ev}/save", headers=me, json={"saved": True, "reminder": True}).status_code in (200, 204)
        with Session(engine) as s:
            assert reminders.send_due_reminders(s) == 1
            assert reminders.send_due_reminders(s) == 0  # never twice
        assert sent == [("remi-reminder@example.com", "Tomorrow: Soup night")]
        for ev in (e1, e2):
            client.delete(f"/api/events/{ev}", headers=me)
