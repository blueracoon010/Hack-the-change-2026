"""Full profiles in the shared database: save "About me", view other members, privacy when discovery is off."""

import os
import tempfile

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/profiles.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def _signup(client, name, email):
    r = client.post("/api/auth/signup", json={"name": name, "email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]["id"]


def test_full_profile_and_viewing_others():
    with TestClient(app) as client:
        ana, ana_id = _signup(client, "Ana Profile", "ana-profile@example.com")
        ben, ben_id = _signup(client, "Ben Profile", "ben-profile@example.com")

        about = {"bio": "  Love long walks.  ", "neighbourhood": "Bridgeland", "socialStyle": "Quiet & small groups"}
        r = client.put("/api/social/profile", headers=ana, json={
            "instagram": "ana_walks", "interests": ["Books", "Walking & outdoors"], "discoverable": False,
            "bio": about["bio"], "neighbourhood": about["neighbourhood"], "social_style": about["socialStyle"]})
        assert r.status_code == 200, r.text
        assert r.json()["bio"] == "Love long walks." and r.json()["social_style"] == "Quiet & small groups"

        # The Social links form omits About-me fields: they must be kept, not wiped.
        r = client.put("/api/social/profile", headers=ana, json={"instagram": "ana_walks", "interests": ["Books"], "discoverable": False})
        assert r.json()["bio"] == "Love long walks." and r.json()["neighbourhood"] == "Bridgeland"

        # Discovery off: Ben sees only the name and counts.
        private = client.get(f"/api/social/people/{ana_id}", headers=ben).json()
        assert private["private"] is True and private["name"] == "Ana Profile" and "bio" not in private and "instagram" not in private
        # Ana always sees her own full profile.
        assert client.get(f"/api/social/people/{ana_id}", headers=ana).json()["bio"] == "Love long walks."

        # Discovery on: Ben sees bio, neighbourhood, interests, Instagram and shared interests.
        client.put("/api/social/profile", headers=ana, json={"instagram": "ana_walks", "interests": ["Books"], "discoverable": True})
        client.put("/api/social/profile", headers=ben, json={"instagram": "", "interests": ["Books", "Music"], "discoverable": True})
        client.put(f"/api/social/following/{ana_id}", headers=ben)
        public = client.get(f"/api/social/people/{ana_id}", headers=ben).json()
        assert public["private"] is False and public["bio"] == "Love long walks." and public["neighbourhood"] == "Bridgeland"
        assert public["instagram"] == "ana_walks" and public["shared_interests"] == ["Books"]
        assert public["is_following"] is True and public["follower_count"] == 1

        assert client.get("/api/social/people/999999", headers=ben).status_code == 404
        assert client.get(f"/api/social/people/{ana_id}").status_code == 401  # members only
        assert client.get("/api/users/me/export", headers=ana).json()["social_profile"]["bio"] == "Love long walks."


def test_visibility_and_instagram_are_separate_and_invites_make_friends():
    with TestClient(app) as client:
        cam, cam_id = _signup(client, "Cam Invite", "cam-invite@example.com")
        dee, dee_id = _signup(client, "Dee Invite", "dee-invite@example.com")

        # Each form saves only its own setting: Instagram doesn't change visibility, and vice versa.
        client.put("/api/social/profile", headers=cam, json={"instagram": "cam_ig"})
        assert client.get("/api/social/profile", headers=cam).json()["discoverable"] is False
        client.put("/api/social/profile", headers=cam, json={"discoverable": True})
        p = client.get("/api/social/profile", headers=cam).json()
        assert p["instagram"] == "cam_ig" and p["show_instagram"] is True

        assert client.get(f"/api/social/people/{cam_id}", headers=dee).json()["instagram"] == "cam_ig"
        client.put("/api/social/profile", headers=cam, json={"show_instagram": False})  # public profile, Instagram hidden
        view = client.get(f"/api/social/people/{cam_id}", headers=dee).json()
        assert view["private"] is False and view["instagram"] == ""
        assert client.get(f"/api/social/people/{cam_id}", headers=cam).json()["instagram"] == "cam_ig"  # you see your own

        # Invite a friend: one tap makes you friends (both follow each other)
        code = client.get("/api/social/invites/mine", headers=cam).json()["code"]
        assert client.post(f"/api/social/invite/{code}/accept", headers=cam).status_code == 400  # own invite
        assert client.post(f"/api/social/invite/{code}/accept", headers=dee).json() == {"id": cam_id, "name": "Cam Invite", "friends": True}
        assert client.post(f"/api/social/invite/{code}/accept", headers=dee).status_code == 200  # twice is fine
        view = client.get(f"/api/social/people/{cam_id}", headers=dee).json()
        assert view["is_following"] and view["follows_you"]
        assert client.post(f"/api/social/invite/{code}/accept").status_code == 401  # must be signed in

        new_code = client.post("/api/social/invites/new", headers=cam).json()["code"]
        assert new_code != code and client.get(f"/api/social/invite/{code}").status_code == 404  # old one switched off
        assert client.get(f"/api/social/invite/{new_code}").status_code == 200
