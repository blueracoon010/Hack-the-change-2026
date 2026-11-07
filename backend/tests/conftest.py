"""Keep tests offline and independent of anyone's backend/.env (real env vars win over .env)."""

import os

os.environ["TICKETMASTER_API_KEY"] = ""
os.environ["MEETUP_ACCESS_TOKEN"] = ""
os.environ["EVENTS_SYNC_MINUTES"] = "0"

# Run the same tests against Postgres: TEST_DATABASE_URL=postgresql://user@localhost:5432/test_db python -m pytest -q
# WARNING: wipes every table in that database first. Never point it at the shared RDS database.
if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
    from sqlmodel import SQLModel

    from app.db import engine, init_db

    init_db()
    SQLModel.metadata.drop_all(engine)
