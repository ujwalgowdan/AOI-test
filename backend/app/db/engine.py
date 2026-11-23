"""SQLAlchemy engine + session factory.

`DATABASE_URL` is required — the rewrite no longer supports the
flat-file fallback. Postgres only. Examples:

  postgresql+psycopg://aoi:aoi@localhost:5432/aoi      # local dev
  postgresql+psycopg://aoi:aoi@db:5432/aoi             # docker-compose

We default to `psycopg` (v3) since `psycopg[binary]` ships in
`requirements.txt`. If a URL arrives with a bare `postgresql://` scheme,
SQLAlchemy picks its registered driver; we keep psycopg pinned via the
explicit `+psycopg` form in the .env example.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine

# Engine is built at import time, before legacy/config.py loads .env — load it here.
# Never overrides vars already set (docker-compose, tests).
load_dotenv()
from sqlalchemy.orm import Session, sessionmaker


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. The backend requires Postgres — "
            "see .env.example and docker-compose.yml."
        )
    return url


engine = create_engine(
    _database_url(),
    pool_pre_ping=True,   # transparently drop / replace stale connections
    future=True,
    # Pin every connection's session TimeZone to IST so `timestamptz`
    # columns (captures.captured_at, sessions.*) read back as IST-aware and
    # `current_date()` / `date(captured_at)` roll over at IST midnight. The
    # hardware is in India; without this the containers' UTC default leaks
    # into every report and the daily count. psycopg passes this straight to
    # libpq's connection `options`.
    connect_args={"options": "-c timezone=Asia/Kolkata"},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_session() -> Session:
    """Open a short-lived DB session. Caller is responsible for closing."""
    return SessionLocal()
