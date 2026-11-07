"""Run from backend/: python -m pytest -q   (auth + privacy flow against a throwaway SQLite DB)."""

import os
import tempfile

os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_auth_and_privacy_flow():
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"

        r = client.post("/api/auth/signup", json={"name": "Ada", "email": "Ada@Example.com", "password": "correct-horse"})
        assert r.status_code == 201, r.text
        token = r.json()["access_token"]
        auth = {"Authorization": f"Bearer {token}"}

        assert client.post("/api/auth/signup", json={"name": "A", "email": "ada@example.com", "password": "12345678"}).status_code == 409
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-pass"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse"}).status_code == 200

        assert client.get("/api/auth/me").status_code == 401
        assert client.get("/api/auth/me", headers=auth).json()["email"] == "ada@example.com"
        assert client.patch("/api/users/me", json={"name": "Ada L"}, headers=auth).json()["name"] == "Ada L"
        assert client.get("/api/users/me/export", headers=auth).json()["profile"]["name"] == "Ada L"

        assert client.delete("/api/users/me", headers=auth).status_code == 204
        assert client.get("/api/auth/me", headers=auth).status_code == 401


def test_follow_graph():
    with TestClient(app) as client:
        def signup(name):
            r = client.post('/api/auth/signup', json={'name': name, 'email': f'{name}@example.com', 'password': 'correct-horse'})
            assert r.status_code == 201, r.text
            return r.json()['user']['id'], {'Authorization': f"Bearer {r.json()['access_token']}"}

        a, auth_a = signup('FollowerA')
        b, auth_b = signup('FollowerB')
        assert client.get('/api/social/me').status_code == 401
        assert client.put(f'/api/social/following/{b}').status_code == 401
        assert client.put(f'/api/social/following/{a}', headers=auth_a).status_code == 400
        assert client.put('/api/social/following/999999', headers=auth_a).status_code == 404
        for _ in range(2):
            assert client.put(f'/api/social/following/{b}', headers=auth_a).status_code == 204
        state_a = client.get('/api/social/me', headers=auth_a).json()
        state_b = client.get('/api/social/me', headers=auth_b).json()
        assert state_a['following'] == [b]
        assert state_a['following_count'] == 1
        assert state_a['follower_count'] == 0
        assert state_b['followers'] == [a]
        assert state_b['following_count'] == 0
        assert all(set(p) == {'id', 'name', 'instagram', 'reasons', 'suggested'} for p in state_a['people'])
        assert a not in [p['id'] for p in state_a['people']]
        assert client.put(f'/api/social/following/{a}', headers=auth_b).status_code == 204
        assert client.get('/api/social/me', headers=auth_a).json()['followers'] == [b]
        for _ in range(2):
            assert client.delete(f'/api/social/following/{b}', headers=auth_a).status_code == 204
        assert client.get('/api/social/me', headers=auth_a).json()['following_count'] == 0
        assert client.get('/api/social/me', headers=auth_b).json()['follower_count'] == 0
        assert len(client.get('/api/users/me/export', headers=auth_a).json()['connections']) == 1
        assert client.put(f'/api/social/following/{b}', headers=auth_a).status_code == 204
        assert client.delete('/api/users/me', headers=auth_b).status_code == 204
        state_a = client.get('/api/social/me', headers=auth_a).json()
        assert state_a['followers'] == []
        assert state_a['following'] == []
        assert b not in [p['id'] for p in state_a['people']]
        assert client.delete('/api/users/me', headers=auth_a).status_code == 204


def test_social_discovery_and_invitations():
    with TestClient(app) as client:
        def signup(name):
            r = client.post('/api/auth/signup', json={'name': name, 'email': f'{name}@example.com', 'password': 'correct-horse'})
            assert r.status_code == 201
            return r.json()['user']['id'], {'Authorization': f"Bearer {r.json()['access_token']}"}
        a, auth_a = signup('SocialA')
        b, auth_b = signup('SocialB')
        c, auth_c = signup('SocialC')
        assert client.put('/api/social/profile', json={}).status_code == 401
        assert client.get('/api/social/profile', headers=auth_a).json()['discoverable'] is False
        assert client.put('/api/social/profile', json={'instagram': 'https://evil.example'}, headers=auth_a).status_code == 422
        assert client.put('/api/social/profile', json={'interests': ['Unknown']}, headers=auth_a).status_code == 422
        body = {'instagram': '@Social_A', 'interests': ['Books'], 'discoverable': True}
        result = client.put('/api/social/profile', json=body, headers=auth_a).json()
        token = client.get('/api/social/invites/mine', headers=auth_a).json()['code']
        assert result['instagram'] == 'social_a' and len(token) == 8
        assert client.get('/api/social/invites/mine', headers=auth_a).json()['code'] == token  # stable until renewed
        invite = client.get(f'/api/social/invite/{token}')
        assert invite.status_code == 200
        assert invite.json() == {'id': a, 'name': 'SocialA', 'instagram': 'social_a'}
        assert client.get(f'/api/social/invite/{token.lower()[:4]}-{token.lower()[4:]}').status_code == 200  # typed by hand
        # Public invite tokens must NEVER authorize API actions as the inviter.
        assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code == 401
        from fastapi.security import HTTPAuthorizationCredentials
        from app.events.router import optional_user_id
        assert optional_user_id(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)) is None
        assert optional_user_id(HTTPAuthorizationCredentials(scheme='Bearer', credentials=auth_a['Authorization'].split()[1])) == a
        assert client.get('/api/social/invite/bad-token').status_code == 404
        assert client.get(f"/api/social/invite/{auth_a['Authorization'].split()[1]}").status_code == 404
        client.put('/api/social/profile', json={'interests': ['Books'], 'discoverable': True}, headers=auth_b)
        people = client.get('/api/social/me', headers=auth_b).json()['people']
        ana = next(p for p in people if p['id'] == a)
        assert ana['suggested'] and ana['reasons'] == ['Shared interests: Books']
        assert ana['instagram'] == 'social_a'
        client.put(f'/api/social/following/{a}', headers=auth_b)
        assert not next(p for p in client.get('/api/social/me', headers=auth_b).json()['people'] if p['id'] == a)['suggested']
        # C follows B, who follows A: show a mutual-follow reason, not a fabricated match.
        client.put('/api/social/profile', json={'discoverable': True}, headers=auth_c)
        client.put(f'/api/social/following/{b}', headers=auth_c)
        ana = next(p for p in client.get('/api/social/me', headers=auth_c).json()['people'] if p['id'] == a)
        assert ana['suggested'] and '1 people you follow' in ana['reasons'][0]
        assert client.get('/api/users/me/export', headers=auth_a).json()['social_profile']['instagram'] == 'social_a'
        client.put('/api/social/profile', json={**body, 'discoverable': False}, headers=auth_a)
        # Invites work for private profiles too, but Instagram is no longer shown.
        assert client.get(f'/api/social/invite/{token}').json() == {'id': a, 'name': 'SocialA', 'instagram': ''}
        ana = next(p for p in client.get('/api/social/me', headers=auth_c).json()['people'] if p['id'] == a)
        assert not ana['suggested'] and ana['instagram'] == '' and ana['reasons'] == []
        for auth in (auth_a, auth_b, auth_c):
            assert client.delete('/api/users/me', headers=auth).status_code == 204
        assert client.get(f'/api/social/invite/{token}').status_code == 404

def test_buddy_preferences_and_audiences():
    from datetime import datetime, timedelta, timezone
    with TestClient(app) as client:
        def signup(name):
            r = client.post('/api/auth/signup', json={'name': name, 'email': f'{name}@example.com', 'password': 'correct-horse'})
            assert r.status_code == 201, r.text
            return r.json()['user']['id'], {'Authorization': f"Bearer {r.json()['access_token']}"}
        a, auth_a = signup('BuddyA')
        b, auth_b = signup('BuddyB')
        c, auth_c = signup('BuddyC')
        soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        def create(title):
            r = client.post('/api/events', json={'title': title, 'start': soon, 'position': {'lat': 51.04, 'lng': -114.07}}, headers=auth_a)
            assert r.status_code == 201, r.text
            return int(r.json()['id'])
        e1, e2 = create('Buddy event one'), create('Buddy event two')
        base = {'mode': 'any', 'audience': 'everyone', 'event_ids': [], 'people_ids': []}
        def available(event, auth):
            r = client.get(f'/api/buddies/events/{event}', headers=auth)
            assert r.status_code == 200, r.text
            return r.json()['people']
        assert client.get('/api/buddies/me').status_code == 401
        assert client.get(f'/api/buddies/events/{e1}').status_code == 401
        assert client.put('/api/buddies/me', json={**base, 'mode': 'bad'}, headers=auth_a).status_code == 422
        assert client.put('/api/buddies/me', json={**base, 'event_ids': [999999]}, headers=auth_a).status_code == 400
        assert client.put('/api/buddies/me', json=base, headers=auth_a).status_code == 200
        assert available(e1, auth_b) == [{'id': a, 'name': 'BuddyA'}]
        assert available(e2, auth_c) == [{'id': a, 'name': 'BuddyA'}]
        assert available(e1, auth_a) == []
        # General availability must not auto-create RSVPs.
        assert not client.get(f'/api/events/{e1}', headers=auth_a).json()['meGoing']
        selected = {**base, 'mode': 'selected', 'event_ids': [e1]}
        assert client.put('/api/buddies/me', json=selected, headers=auth_a).status_code == 200
        assert available(e1, auth_b)
        assert available(e2, auth_b) == []
        assert client.put('/api/buddies/me', json={**selected, 'audience': 'mutual'}, headers=auth_a).status_code == 200
        assert available(e1, auth_b) == []
        client.put(f'/api/social/following/{b}', headers=auth_a)
        assert available(e1, auth_b) == []
        client.put(f'/api/social/following/{a}', headers=auth_b)
        assert available(e1, auth_b)
        assert available(e1, auth_c) == []
        only_b = {**selected, 'audience': 'selected', 'people_ids': [b]}
        assert client.put('/api/buddies/me', json={**only_b, 'people_ids': [c]}, headers=auth_a).status_code == 400
        assert client.put('/api/buddies/me', json=only_b, headers=auth_a).status_code == 200
        assert available(e1, auth_b) and not available(e1, auth_c)
        client.delete(f'/api/social/following/{b}', headers=auth_a)
        assert available(e1, auth_b) == []
        # Turning Off hides availability and clears RSVP buddy flags.
        client.put('/api/buddies/me', json=selected, headers=auth_a)
        client.put(f'/api/events/{e1}/rsvp', json={'lookingForBuddy': True}, headers=auth_a)
        assert client.put('/api/buddies/me', json={**base, 'mode': 'off'}, headers=auth_a).status_code == 200
        assert available(e1, auth_b) == []
        assert not client.get(f'/api/events/{e1}', headers=auth_a).json()['meLookingForBuddy']
        # An explicit event request can re-enable selected-event availability.
        client.put(f'/api/events/{e1}/rsvp', json={'lookingForBuddy': True}, headers=auth_a)
        assert client.get('/api/buddies/me', headers=auth_a).json()['mode'] == 'selected'
        assert available(e1, auth_b)
        client.put(f'/api/events/{e1}/rsvp', json={'lookingForBuddy': False}, headers=auth_a)
        assert available(e1, auth_b) == []
        assert client.get('/api/users/me/export', headers=auth_a).json()['buddy_preferences'] is not None
        private = client.post('/api/events', json={'title': 'Private buddy event', 'start': soon, 'visibility': 'private', 'position': {'lat': 51.04, 'lng': -114.07}}, headers=auth_a)
        assert private.status_code == 201, private.text
        private_id = int(private.json()['id'])
        assert client.get(f'/api/buddies/events/{private_id}', headers=auth_c).status_code == 404
        assert client.put('/api/buddies/me', json={**base, 'mode': 'selected', 'event_ids': [private_id]}, headers=auth_c).status_code == 400
        assert client.put('/api/buddies/me', json=base, headers=auth_c).status_code == 200
        assert available(private_id, auth_a) == []
        for auth in (auth_a, auth_b, auth_c):
            assert client.delete('/api/users/me', headers=auth).status_code == 204
