# Backend: API

**Tech stack:** Python FastAPI with SQLModel on SQLite (switch to Postgres through `DATABASE_URL`), JWT auth with bcrypt-hashed passwords, and httpx clients for AESO and Calgary Open Data with in-memory caching.

**Caveats:** Create a venv and install `requirements-ml.txt` (or `requirements.txt` if you skip ML, in which case `/api/ml/forecast` returns 503). Set a long random `JWT_SECRET` in `backend/.env` before deploying. AESO data comes from AESO's public ETS reports, so it needs internet access, and if AESO changes a report's format, `app/services/aeso.py` is the one file to fix.

**What to work on:** Add your idea's tables in `app/models.py` and its routes as a new file in `app/routers/` (then register it in `app/main.py`), using `Depends(get_current_user)` on anything that needs login.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-ml.txt
cp .env.example .env               # optional, defaults work locally
uvicorn app.main:app --reload      # interactive docs: http://localhost:8000/docs
python -m pytest -q                # auth + privacy flow test
```

| Endpoint | What it returns |
|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | Auth (Bearer token) |
| `PATCH /api/users/me`, `GET /api/users/me/export`, `DELETE /api/users/me` | Profile edit, data export, account deletion |
| `GET /api/energy/current` | Live AESO load, generation by fuel, interchange, renewable % (cached 60 s) |
| `GET /api/energy/pool-price?days=7` | Hourly pool price + Alberta demand (cached 5 min) |
| `GET /api/energy/actual-vs-forecast?days=1` | AESO's own forecast vs actuals, including upcoming hours |
| `GET /api/calgary/dataset/{id}?limit=&where=&select=&order=` | **Any** data.calgary.ca dataset |
| `GET /api/calgary/solar/monthly`, `/solar/top-sites` | City solar production example |
| `GET /api/ml/forecast` | Next 24 h demand forecast from the model in `/ml` |
