from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, pool_pre_ping=True)


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
