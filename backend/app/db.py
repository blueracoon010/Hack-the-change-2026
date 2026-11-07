from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings


def normalize_url(url: str) -> str:
    """Accept the plain postgres:// / postgresql:// URLs AWS and others print, and use the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = normalize_url(settings.database_url)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # Local file, one per laptop (backend/app.db).
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Shared database (AWS RDS Postgres): every teammate's localhost backend points here and sees the same users.
    # pre_ping/recycle survive Wi-Fi drops and RDS closing idle connections; small pool keeps us far below RDS limits.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=5,
                           connect_args={"connect_timeout": 10})


def database_kind() -> str:
    return "sqlite (this laptop only)" if IS_SQLITE else f"postgres (shared) at {engine.url.host}"


def init_db() -> None:
    from . import models  # noqa: F401  (registers tables)
    from .events import models as event_models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


# create_all() makes new tables but never adds columns to existing ones. List new columns here so
# everyone's existing database (SQLite or Postgres) picks them up on the next start. (table, column, SQL type + default)
_NEW_COLUMNS = [
    ("event", "visibility", "VARCHAR NOT NULL DEFAULT 'public'"),
]


def _add_missing_columns() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _NEW_COLUMNS:
            if insp.has_table(table) and column not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl}'))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
