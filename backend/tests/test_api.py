"""Run from backend/: python -m pytest -q   (auth + privacy flow against a throwaway SQLite DB)."""

import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

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
