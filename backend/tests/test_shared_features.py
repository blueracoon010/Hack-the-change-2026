"""Community chat, saved events, My people, and forgot/reset password, all through the database (no network)."""

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def _signup(client, name, email, password="password123"):
    r = client.post("/api/auth/signup", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]["id"]


def test_community_memberships_and_chat_are_shared():
    with TestClient(app) as client:
        a, _ = _signup(client, "Cara Chat", "cara-chat@example.com")
        b, _ = _signup(client, "Dev Chat", "dev-chat@example.com")
        url = "/api/community/groups/books/channels/introductions/messages"
        assert client.post(url, headers=a, json={"text": "hi"}).status_code == 403  # must join first
        assert client.put("/api/community/groups/books/membership", headers=a).status_code == 204
        assert client.put("/api/community/groups/books/membership", headers=a).status_code == 204  # idempotent
        assert client.post(url, headers=a, json={"text": "  Hello, I love mysteries!  "}).status_code == 201
        assert client.post(url, headers=a, json={"text": "   "}).status_code == 422
        # Another member sees the real count and the message
        books = {g["id"]: g for g in client.get("/api/community/groups", headers=b).json()}["books"]
        assert books["members"] == 1 and books["joined"] is False
        msgs = client.get(url, headers=b).json()
        assert [(m["name"], m["text"], m["mine"]) for m in msgs] == [("Cara Chat", "Hello, I love mysteries!", False)]
        assert client.delete(f"/api/community/messages/{msgs[0]['id']}", headers=b).status_code == 404  # not theirs
        assert client.get("/api/community/groups/nope/channels/general/messages", headers=b).status_code == 404
        export = client.get("/api/users/me/export", headers=a).json()
        assert len(export["community_messages"]) == 1 and export["community_groups"][0]["group_id"] == "books"
        assert client.delete("/api/users/me", headers=a).status_code == 204
        assert client.get(url, headers=b).json() == []


def test_saved_events_and_my_people():
    soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    with TestClient(app) as client:
        me, me_id = _signup(client, "Me Map", "me-map@example.com")
        friend, friend_id = _signup(client, "Fran Friend", "fran-map@example.com")
        shy, shy_id = _signup(client, "Shy Sam", "shy-map@example.com")
        ev = client.post("/api/events", headers=friend, json={"title": "Book swap", "start": soon,
                                                              "position": {"lat": 51.05, "lng": -114.06}}).json()
        # Saved + reminder survive a reload (they're in the database)
        assert client.put(f"/api/events/{ev['id']}/save", headers=me, json={"saved": True, "reminder": True}).status_code == 200
        assert client.get("/api/events/saved", headers=me).json() == {"saved": [ev["id"]], "reminders": [ev["id"]]}
        listed = client.get("/api/events/saved/events", headers=me).json()
        assert [e["title"] for e in listed] == ["Book swap"] and listed[0]["id"] == ev["id"]
        client.put(f"/api/events/{ev['id']}/save", headers=me, json={"saved": False, "reminder": False})
        assert client.get("/api/events/saved", headers=me).json() == {"saved": [], "reminders": []}
        assert client.get("/api/events/saved/events", headers=me).json() == []

        assert client.get("/api/social/map-people", headers=me).json() == {"people": [], "hidden": 0}
        # Fran shares a neighbourhood (we pre-seed the geocode cache so the test needs no network); Sam doesn't share.
        from sqlmodel import Session
        from app.db import engine
        from app.events.models import GeocodeCache
        with Session(engine) as s:
            s.merge(GeocodeCache(query="bridgeland, calgary, ab", lat=51.0519, lon=-114.0451)); s.commit()
        client.put("/api/social/profile", headers=friend, json={"instagram": "", "interests": ["Books"], "discoverable": True, "neighbourhood": "Bridgeland"})
        client.put("/api/social/profile", headers=shy, json={"instagram": "", "interests": [], "discoverable": False, "neighbourhood": "Bridgeland"})
        client.put(f"/api/events/{ev['id']}/rsvp", headers=friend, json={"lookingForBuddy": False})
        for target in (friend_id, shy_id):
            client.put(f"/api/social/following/{target}", headers=me)

        # Sam is private: following Sam is only a request, so Sam isn't on the map at all until they accept.
        one_way = client.get("/api/social/map-people", headers=me).json()
        assert one_way["hidden"] == 0 and len(one_way["people"]) == 1
        fran = one_way["people"][0]
        assert fran["name"] == "Fran Friend" and fran["relation"] == "following" and fran["position"] == {"lat": 51.0519, "lng": -114.0451}
        assert fran["interests"] == ["learning"] and fran["goingTo"] == []  # RSVPs only for mutual connections

        client.put(f"/api/social/following/{me_id}", headers=friend)
        client.post(f"/api/social/requests/{friend_id}/accept", headers=me)  # now mutual
        fran = client.get("/api/social/map-people", headers=me).json()["people"][0]
        assert fran["relation"] == "connection" and fran["goingTo"] == [ev["id"]]


def test_forgot_and_reset_password(capsys):
    with TestClient(app) as client:
        _signup(client, "Rita Reset", "rita-reset@example.com", "old-password-1")
        generic = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
        real = client.post("/api/auth/forgot-password", json={"email": "Rita-Reset@example.com"})
        assert generic.status_code == real.status_code == 202 and generic.json() == real.json()  # no account fishing

        printed = capsys.readouterr().out  # no SMTP in tests: the email is printed
        token = printed.split("reset-password?token=")[1].split()[0]
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401  # not a login

        assert client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
        r = client.post("/api/auth/reset-password", json={"token": token, "password": "new-password-2"})
        assert r.status_code == 200 and r.json()["user"]["email"] == "rita-reset@example.com"
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "another-pass-3"}).status_code == 400  # single use
        assert client.post("/api/auth/reset-password", json={"token": "garbage", "password": "another-pass-3"}).status_code == 400
        assert client.post("/api/auth/login", json={"email": "rita-reset@example.com", "password": "old-password-1"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "rita-reset@example.com", "password": "new-password-2"}).status_code == 200
