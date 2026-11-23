"""Shared test setup.

The router-level tests import `app.routers.analyze`, which transitively
imports `app.db.engine` (needs `DATABASE_URL`) and `app._bootstrap`
(chdirs into `AOI_DATA_DIR` and creates the data subdirs there). Set
both env vars *before* any backend module is loaded by giving them
defaults here — pytest loads conftest.py before collecting test
modules, so this runs first.

`DATABASE_URL` is set to a parseable-but-unreachable URL because the
router tests are written so the 409 branch raises before any
`SessionLocal()` is opened. No connection is attempted, so the URL
never has to resolve. Tests that *do* need a real DB should override
this via their own fixture.

`AOI_DATA_DIR` points at a session-scoped temp directory so JPEGs
written during a test land in throwaway storage and don't leak into
the dev `data/` tree.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="aoi_test_"))
os.environ.setdefault("AOI_DATA_DIR", str(_TEST_DATA_DIR))
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test:test@127.0.0.1:1/aoi_test_unreachable",
)
