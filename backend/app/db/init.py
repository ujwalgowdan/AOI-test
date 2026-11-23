"""DB bootstrap: create schema + one-shot JSON → Postgres migration.

Called from `app.main.lifespan` at backend startup. Idempotent — running
it again on an already-migrated DB does nothing.

Migration sources (all under `AOI_DATA_DIR`):
- employees.json     → operators
- inspectors.json    → inspectors
- daily_test_log.json → captures (best-effort; the legacy file had no
  per-cable image_path, so those rows get NULL image_path)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.db import models
from app.db.engine import SessionLocal, engine

log = logging.getLogger("aoi.db")


# Seeds match the defaults that legacy `_seed_defaults_if_empty` planted into
# employees.json / inspectors.json. We keep them here so a fresh Postgres
# database isn't empty on first boot — the dashboard shows two operators and
# two inspectors out of the box, just like before.
_DEFAULT_OPERATORS: list[tuple[str, str]] = [
    ("EMP001", "John Doe"),
    ("EMP002", "Jane Smith"),
]
_DEFAULT_INSPECTORS: list[tuple[str, str]] = [
    ("INS001", "Mr. Vinay"),
    ("INS002", "Mr. Kumar"),
]


def _data_dir() -> Path:
    return Path(os.getenv("AOI_DATA_DIR", "./data")).resolve()


def init_schema() -> None:
    models.Base.metadata.create_all(bind=engine)


def _migrate_operators(db, data_dir: Path) -> int:
    path = data_dir / "employees.json"
    if not path.exists():
        return 0
    with path.open() as f:
        payload: dict[str, Any] = json.load(f)
    inserted = 0
    for entry in payload.get("employees", []):
        if not entry.get("id"):
            continue
        if db.get(models.Operator, entry["id"]):
            continue
        db.add(models.Operator(id=entry["id"], name=entry.get("name", entry["id"])))
        inserted += 1
    return inserted


def _migrate_inspectors(db, data_dir: Path) -> int:
    path = data_dir / "inspectors.json"
    if not path.exists():
        return 0
    with path.open() as f:
        payload: dict[str, Any] = json.load(f)
    inserted = 0
    for entry in payload.get("inspectors", []):
        if not entry.get("id"):
            continue
        if db.get(models.Inspector, entry["id"]):
            continue
        db.add(models.Inspector(id=entry["id"], name=entry.get("name", entry["id"])))
        inserted += 1
    return inserted


def _migrate_daily_log(db, data_dir: Path) -> int:
    """Copy per-cable rows from daily_test_log.json into `captures`.

    The legacy log had no per-cable image_path or session_id, so this
    fills NULL for image_path and a synthetic 'legacy-<date>' session_id
    so the column stays NOT NULL. Best-effort — if any row is malformed
    we skip it.
    """
    path = data_dir / "daily_test_log.json"
    if not path.exists():
        return 0
    with path.open() as f:
        payload: dict[str, Any] = json.load(f)
    legacy_date = payload.get("current_date", datetime.utcnow().strftime("%Y-%m-%d"))
    legacy_session_id = f"legacy-{legacy_date}"

    # Sanity guard: if captures already has rows for this synthetic
    # session, the migration ran before — bail out idempotently.
    existing = db.scalar(
        select(models.Capture.id).where(models.Capture.session_id == legacy_session_id).limit(1)
    )
    if existing:
        return 0

    inserted = 0
    for entry in payload.get("tests", []):
        op_id = entry.get("employee_id") or ""
        # If the operator/inspector referenced no longer exists, skip
        # rather than violating the FK.
        if not op_id or not db.get(models.Operator, op_id):
            continue
        inspector_name = entry.get("inspector_name") or ""
        inspector = db.scalar(
            select(models.Inspector).where(models.Inspector.name == inspector_name).limit(1)
        )
        if inspector is None:
            continue
        result_raw = entry.get("result", "")
        # Legacy stored 'Pass' / 'Fail'; normalise to the new vocabulary.
        result = {"Pass": "OK", "Fail": "NOT OK"}.get(result_raw, result_raw or "NOT DETECTED")
        db.add(
            models.Capture(
                session_id=legacy_session_id,
                operator_id=op_id,
                inspector_id=inspector.id,
                result=result,
                detected_order=[],
                expected_order=[],
                image_path=None,
            )
        )
        inserted += 1
    return inserted


def migrate_from_json() -> None:
    data_dir = _data_dir()
    with SessionLocal() as db:
        op_count = _migrate_operators(db, data_dir)
        in_count = _migrate_inspectors(db, data_dir)
        # Only seed defaults if the JSON file didn't provide any rows.
        # (The JSON files were themselves seeded with these defaults, so
        # this only triggers when both Postgres and the JSON files are
        # empty — fresh first boot, no data dir.)
        if db.scalar(select(models.Operator.id).limit(1)) is None:
            for oid, name in _DEFAULT_OPERATORS:
                db.add(models.Operator(id=oid, name=name))
        if db.scalar(select(models.Inspector.id).limit(1)) is None:
            for iid, name in _DEFAULT_INSPECTORS:
                db.add(models.Inspector(id=iid, name=name))
        cap_count = _migrate_daily_log(db, data_dir)
        db.commit()
        if op_count or in_count or cap_count:
            log.info(
                "DB migration: +%d operators, +%d inspectors, +%d captures",
                op_count, in_count, cap_count,
            )


def init_db() -> None:
    init_schema()
    migrate_from_json()
