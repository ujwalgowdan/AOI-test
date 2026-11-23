"""Bulk-export tests for `/api/captures/download/zip`.

Needs a real Postgres connection — this is the first test in the suite
that exercises the DB layer end-to-end. When `DATABASE_URL` points at
the conftest default (unreachable), the whole module skips. Run inside
the docker compose stack for the full pass:

    docker compose exec backend pytest tests/test_captures_download.py

The test seeds three captures (two OK on day A, one NOT OK on day B)
under uniquely-tagged operator/inspector/session IDs so it doesn't
collide with any data already in the live dev database, and writes
small placeholder JPEGs to disk so the ZIP path exercises the file
write branch (not just the manifest-only branch).
"""

from __future__ import annotations

import io
import os
import uuid
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

try:
    from app.adapters import legacy
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)


@pytest.fixture(scope="module")
def db_or_skip():
    """Ensure tables exist and the DB is reachable, or skip the module."""
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Operator).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")


@pytest.fixture(scope="module")
def admin_token():
    return legacy.config.ADMIN_PASSWORD


@pytest.fixture
def client() -> TestClient:
    # NB: not used as a context manager → lifespan does not run, so the
    # JSON-migration step in init_db is skipped. Schema is already
    # ensured by db_or_skip.
    # Station token (F-05): ignored unless AOI_REQUIRE_STATION_TOKEN is on.
    return TestClient(app, headers={"X-Station-Token": os.getenv("AOI_STATION_TOKEN", "")})


@pytest.fixture
def seeded(db_or_skip):
    """Insert two operators, two inspectors, three captures.

    Tagged IDs (uuid-prefixed) keep this safe to run against the live
    dev DB without conflicting with seed data. Each capture's JPEG is
    written as a 4-byte placeholder so the endpoint exercises the
    `zf.write(path, arcname=name)` branch.
    """
    tag = uuid.uuid4().hex[:8]
    op_id = f"OP_DL_{tag}"
    ins_id = f"IN_DL_{tag}"
    sess_id = f"sess_dl_{tag}"

    now = datetime.now()
    day_a = now - timedelta(days=1)
    day_b = now

    images_dir = Path(legacy.DATA_DIR) / "detection_results"
    images_dir.mkdir(parents=True, exist_ok=True)
    filenames = [f"OK_DL_{tag}_a.jpg", f"OK_DL_{tag}_b.jpg", f"NOT_OK_DL_{tag}.jpg"]
    for fname in filenames:
        (images_dir / fname).write_bytes(b"\xff\xd8\xff\xd9")  # minimal JPEG marker

    with SessionLocal() as db:
        db.add_all([
            models.Operator(id=op_id, name=f"Test Op {tag}"),
            models.Inspector(id=ins_id, name=f"Test Insp {tag}"),
            models.Capture(
                session_id=sess_id, operator_id=op_id, inspector_id=ins_id,
                result="OK", detected_order=["yellow", "green"],
                expected_order=["yellow", "green"], image_path=filenames[0],
                captured_at=day_a,
            ),
            models.Capture(
                session_id=sess_id, operator_id=op_id, inspector_id=ins_id,
                result="OK", detected_order=["yellow", "green"],
                expected_order=["yellow", "green"], image_path=filenames[1],
                captured_at=day_a + timedelta(minutes=5),
            ),
            models.Capture(
                session_id=sess_id, operator_id=op_id, inspector_id=ins_id,
                result="NOT OK", detected_order=["green", "yellow"],
                expected_order=["yellow", "green"], image_path=filenames[2],
                captured_at=day_b,
            ),
        ])
        db.commit()

    yield {
        "tag": tag,
        "op_id": op_id,
        "ins_id": ins_id,
        "sess_id": sess_id,
        "filenames": filenames,
        "day_a": day_a.date(),
        "day_b": day_b.date(),
    }

    # Teardown — remove inserted rows + files.
    with SessionLocal() as db:
        db.query(models.Capture).filter(models.Capture.session_id == sess_id).delete()
        db.query(models.Inspector).filter(models.Inspector.id == ins_id).delete()
        db.query(models.Operator).filter(models.Operator.id == op_id).delete()
        db.commit()
    for fname in filenames:
        try:
            (images_dir / fname).unlink()
        except FileNotFoundError:
            pass


def test_download_requires_admin(client, seeded):
    r = client.get(
        "/api/captures/download/zip",
        params={"start": seeded["day_a"].isoformat(), "end": seeded["day_b"].isoformat()},
    )
    assert r.status_code == 401


def test_download_rejects_wrong_token(client, seeded):
    r = client.get(
        "/api/captures/download/zip",
        params={"start": seeded["day_a"].isoformat(), "end": seeded["day_b"].isoformat()},
        headers={"Authorization": "Bearer this-is-not-the-real-token-xyz"},
    )
    assert r.status_code == 403


def test_download_all_returns_zip_with_manifest(client, seeded, admin_token):
    r = client.get(
        "/api/captures/download/zip",
        params={"start": seeded["day_a"].isoformat(), "end": seeded["day_b"].isoformat()},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    cd = r.headers.get("content-disposition", "")
    assert "captures_" in cd and cd.endswith('.zip"')

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    # Manifest is always present.
    assert "manifest.csv" in names
    # The seeded captures may share a window with other rows in the dev
    # DB, so assert OUR three filenames are inside rather than the total
    # count being exactly 3.
    for fname in seeded["filenames"]:
        assert fname in names, f"{fname} missing from ZIP"

    manifest = zf.read("manifest.csv").decode()
    header_line = manifest.splitlines()[0]
    assert header_line.startswith("timestamp,operator_id,operator_name")
    # Every seeded filename has present=yes in the manifest row.
    for fname in seeded["filenames"]:
        assert f"{fname},yes" in manifest, f"manifest missing yes-row for {fname}"


def test_download_result_filter_excludes_others(client, seeded, admin_token):
    r = client.get(
        "/api/captures/download/zip",
        params={
            "start": seeded["day_a"].isoformat(),
            "end": seeded["day_b"].isoformat(),
            "result": "NOT OK",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    not_ok_file, ok_a, ok_b = seeded["filenames"][2], seeded["filenames"][0], seeded["filenames"][1]
    assert not_ok_file in names
    # The OK captures we seeded must NOT be in the NOT OK filter.
    assert ok_a not in names
    assert ok_b not in names


def test_download_413_when_cap_exceeded(client, seeded, admin_token, monkeypatch):
    from app.routers import captures as captures_router

    monkeypatch.setattr(captures_router, "MAX_DOWNLOAD_ROWS", 1)
    r = client.get(
        "/api/captures/download/zip",
        params={"start": seeded["day_a"].isoformat(), "end": seeded["day_b"].isoformat()},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 413
    assert "narrow" in r.json()["detail"].lower()
