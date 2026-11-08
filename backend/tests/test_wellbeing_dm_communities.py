"""Journal + affirmations, friend-only direct messages, and communities people create (public / private)."""

import os
import tempfile

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/shared.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.test_schedule_badges import _friends, _signup  # noqa: E402


def test_journal_is_private_and_affirmations_are_on_theme():
    with TestClient(app) as client:
        deck = client.get("/api/wellbeing/affirmations?count=5").json()
        assert len(deck["cards"]) == 5 and {c["theme"] for c in deck["deck"]} <= {"happiness", "belonging"}
        only = client.get("/api/wellbeing/affirmations?theme=belonging&count=28").json()
        assert only["deck"] and all(c["theme"] == "belonging" for c in only["deck"])
        assert client.get("/api/wellbeing/affirmations?theme=random").status_code == 422

        a, _ = _signup(client, "Jo Journal", "jo-journal@example.com")
        b, _ = _signup(client, "Kai Nosy", "kai-journal@example.com")
        e = client.post("/api/wellbeing/journal", headers=a, json={"title": "Rough day", "body": "Felt overwhelmed", "mood": "stressed"}).json()
        assert client.post("/api/wellbeing/journal", headers=a, json={"mood": "ecstatic"}).status_code == 422
        assert client.put(f"/api/wellbeing/journal/{e['id']}", headers=b, json={"body": "hi"}).status_code == 404
        assert client.get("/api/wellbeing/journal", headers=b).json() == []
        upd = client.put(f"/api/wellbeing/journal/{e['id']}", headers=a, json={"title": "Rough day", "body": "Better after a walk", "mood": "okay"}).json()
        assert upd["body"] == "Better after a walk"
        assert client.get("/api/wellbeing/journal/moods", headers=a).json()["moods"] == {"okay": 1}
        assert client.delete(f"/api/wellbeing/journal/{e['id']}", headers=a).status_code == 204


def test_direct_messages_only_between_friends():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Dee Dm", "dee-dm@example.com")
        b, b_id = _signup(client, "Eli Dm", "eli-dm@example.com")
        c, c_id = _signup(client, "Fay Stranger", "fay-dm@example.com")
        _friends(client, a, a_id, b, b_id)
        assert client.post(f"/api/dm/with/{c_id}", headers=a, json={"text": "hi"}).status_code == 403
        assert client.get(f"/api/dm/with/{a_id}", headers=c).status_code == 403
        assert client.post(f"/api/dm/with/{b_id}", headers=a, json={"text": "Coffee Saturday?"}).status_code == 201
        assert client.get("/api/dm/unread", headers=b).json()["unread"] == 1
        convo = client.get("/api/dm/conversations", headers=b).json()
        assert convo[0]["name"] == "Dee Dm" and convo[0]["unread"] == 1 and convo[0]["last"]["text"] == "Coffee Saturday?"
        t = client.get(f"/api/dm/with/{a_id}", headers=b).json()
        assert t["canMessage"] and [m["text"] for m in t["messages"]] == ["Coffee Saturday?"]
        assert client.get("/api/dm/unread", headers=b).json()["unread"] == 0  # opening marks read


def test_create_public_and_private_communities():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Gia Host", "gia-comm@example.com")
        b, b_id = _signup(client, "Hal Friend", "hal-comm@example.com")
        c, _ = _signup(client, "Ivy Stranger", "ivy-comm@example.com")
        _friends(client, a, a_id, b, b_id)
        pub = client.post("/api/community/groups", headers=a, json={"name": "Sunday Runners", "visibility": "public", "channels": ["Route Ideas", "general"]}).json()
        priv = client.post("/api/community/groups", headers=a, json={"name": "Close Crew", "visibility": "private"}).json()
        assert pub["channels"] == ["route-ideas", "general"] and pub["joined"] and pub["members"] == 1

        ids = lambda h: {g["id"] for g in client.get("/api/community/groups", headers=h).json()}
        assert {pub["id"], priv["id"]} <= ids(b)          # friend sees both
        assert pub["id"] in ids(c) and priv["id"] not in ids(c)  # stranger only sees the public one
        assert client.put(f"/api/community/groups/{priv['id']}/membership", headers=c).status_code == 404
        assert client.put(f"/api/community/groups/{priv['id']}/membership", headers=b).status_code == 204
        assert client.post(f"/api/community/groups/{priv['id']}/channels/general/messages", headers=b, json={"text": "hey!"}).status_code == 201
        msgs = client.get(f"/api/community/groups/{priv['id']}/channels/general/messages", headers=a).json()
        assert msgs[0]["relation"] == "friend"

        assert client.delete(f"/api/community/groups/{priv['id']}", headers=b).status_code == 404  # not the owner
        assert client.delete(f"/api/community/groups/{priv['id']}", headers=a).status_code == 204
        assert client.delete(f"/api/community/groups/{pub['id']}", headers=a).status_code == 204


def test_profile_photo_upload_privacy_and_delete():
    with TestClient(app) as client:
        a, a_id = _signup(client, "Pia Photo", "pia-photo@example.com")
        b, _ = _signup(client, "Quin Viewer", "quin-photo@example.com")
        jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ"
        assert client.put("/api/users/me/avatar", headers=a, json={"photo": "javascript:alert(1)"}).status_code == 422
        assert client.put("/api/users/me/avatar", headers=a, json={"photo": jpeg}).status_code == 200
        assert client.get(f"/api/users/{a_id}/avatar", headers=a).json()["photo"] == jpeg
        assert client.get(f"/api/users/{a_id}/avatar", headers=b).json()["photo"] is None  # private profile, not followed
        assert client.delete("/api/users/me/avatar", headers=a).status_code == 204
        assert client.get(f"/api/users/{a_id}/avatar", headers=a).json()["photo"] is None
