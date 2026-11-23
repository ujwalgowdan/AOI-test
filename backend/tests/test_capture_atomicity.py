"""F-09 (batch 5): a capture is only recorded if its image was written.

Corrected: when cv2.imwrite returns False or raises, /analyze returns a logged
500 *before* inserting a `captures` row, bumping in-memory counts or
broadcasting. A failed DB insert keeps the image (the commit outcome cannot be
told apart from a lost acknowledgement, so deleting could orphan a committed
row) and logs it as a possible orphan; the original error still reaches the
client. No file other than this attempt's is ever touched.
Unchanged: successful captures and the NOT DETECTED path. Needs Postgres.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from pathlib import Path

import cv2
import numpy as np
import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

try:
    from app.adapters import legacy
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
    from app.routers import analyze as A
    from app.services.session_manager import sessions
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)

YELLOW_BGR, GREEN_BGR = (0, 255, 255), (40, 200, 40)  # same synthetic colours as test_detector_evaluate
ROI = {"roi_x": "213", "roi_y": "180", "roi_w": "213", "roi_h": "120"}


def _jpeg(ok: bool = True) -> bytes:
    frame = np.full((480, 640, 3), 40, dtype=np.uint8)
    if ok:
        frame[255:285, 245:275] = YELLOW_BGR
        frame[255:285, 365:395] = GREEN_BGR
    return cv2.imencode(".jpg", frame)[1].tobytes()


@pytest.fixture(scope="module", autouse=True)
def db_or_skip():
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Inspector).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")


@pytest.fixture
def client():
    c = TestClient(app, raise_server_exceptions=False)
    c.headers["Authorization"] = f"Bearer {legacy.config.ADMIN_PASSWORD}"
    return c


@pytest.fixture
def sid(client):
    t = f"A{uuid.uuid4().hex[:8]}"
    assert client.post("/api/employees", json={"id": f"{t}O", "name": "Op"}).status_code == 201
    assert client.post("/api/inspectors", json={"id": f"{t}I", "name": "In"}).status_code == 201
    s = client.post("/api/sessions/start", json={"employee_id": f"{t}O", "inspector_id": f"{t}I"}).json()["id"]
    yield s
    with SessionLocal() as db:
        db.execute(delete(models.Capture).where(models.Capture.session_id == s))
        db.execute(delete(models.SessionRow).where(models.SessionRow.id == s))
        db.execute(delete(models.Operator).where(models.Operator.id == f"{t}O"))
        db.execute(delete(models.Inspector).where(models.Inspector.id == f"{t}I"))
        db.commit()


@pytest.fixture
def other_file():
    """Another attempt's image already on disk; must never be deleted or changed."""
    p = A._images_dir() / f"OK_other_{uuid.uuid4().hex}.jpg"
    p.write_bytes(_jpeg())
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    yield p, digest
    p.unlink(missing_ok=True)


def capture(client, sid, ok=True):
    return client.post(f"/api/sessions/{sid}/analyze", files={"frame": ("f.jpg", _jpeg(ok), "image/jpeg")}, data=ROI)


def rows(sid):
    with SessionLocal() as db:
        return db.scalars(select(models.Capture).where(models.Capture.session_id == sid)).all()


def daily():
    return legacy.daily_counts.get_test_count()


def files():
    return set(A._images_dir().glob("*.jpg"))


def mem(sid):
    s = sessions.get(sid)
    return (s.ok_count, s.not_ok_count, s.last_result, s.last_image_url)


@pytest.fixture
def broadcasts(sid):
    q = sessions.subscribe(sid)
    yield q
    sessions.unsubscribe(sid, q)


# ---------- unchanged: success and NOT DETECTED ----------

def test_success_path_unchanged(client, sid, broadcasts):
    d0 = daily()
    r = capture(client, sid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"] == "OK" and (body["ok_count"], body["not_ok_count"]) == (1, 0)
    name = body["image_url"].rsplit("/", 1)[-1]
    path = A._images_dir() / name
    assert path.exists() and cv2.imread(str(path)) is not None
    assert [c.image_path for c in rows(sid)] == [name]
    assert daily() == d0 + 1
    assert mem(sid)[:3] == (1, 0, "OK")
    assert broadcasts.get_nowait()["type"] == "counts"


def test_not_detected_path_unchanged(client, sid, broadcasts):
    d0, f0 = daily(), files()
    r = capture(client, sid, ok=False)
    assert r.status_code == 200
    assert r.json()["result"] == "NOT DETECTED" and r.json()["image_url"] is None
    assert rows(sid) == [] and daily() == d0 and files() == f0
    assert mem(sid) == (0, 0, None, None) and broadcasts.empty()


# ---------- corrected: image write failure -> logged error, nothing recorded ----------

def _fail_false(path, img, *a, **k):
    return False


def _fail_raise(path, img, *a, **k):
    raise cv2.error("OpenCV(4.x) imwrite: can't write data")


def _partial_then_false(path, img, *a, **k):
    Path(path).write_bytes(b"\xff\xd8partial")  # disk filled mid-write
    return False


@pytest.mark.parametrize("fake", [_fail_false, _fail_raise, _partial_then_false],
                         ids=["imwrite-False", "imwrite-raises", "partial-file-then-False"])
def test_image_write_failure_records_nothing(client, sid, broadcasts, other_file, monkeypatch, caplog, fake):
    other, digest = other_file
    d0, f0 = daily(), files()
    monkeypatch.setattr(A.cv2, "imwrite", fake)
    with caplog.at_level(logging.ERROR):
        r = capture(client, sid)
    assert r.status_code == 500
    assert r.json()["detail"] == "Could not save the capture image; nothing was recorded"
    assert rows(sid) == [] and daily() == d0  # no row, daily count unchanged
    assert mem(sid) == (0, 0, None, None)  # in-memory counts untouched
    assert broadcasts.empty()  # no WebSocket update
    assert any("image write failed" in m for m in caplog.messages)
    new = files() - f0
    if fake is _partial_then_false:  # this attempt's partial file is kept and reported, not deleted
        assert len(new) == 1 and any("partial file kept" in m for m in caplog.messages)
    else:
        assert new == set()
    assert hashlib.sha256(other.read_bytes()).hexdigest() == digest  # other attempt's file untouched


def test_recovers_after_image_write_failure(client, sid, monkeypatch):
    monkeypatch.setattr(A.cv2, "imwrite", _fail_false)
    assert capture(client, sid).status_code == 500
    monkeypatch.undo()
    r = capture(client, sid)
    assert r.status_code == 200 and r.json()["ok_count"] == 1
    assert len(rows(sid)) == 1


# ---------- DB failure after the image write: keep the image, log it, re-raise ----------

def _insert_fails(orig):
    def execute(self, query, *a, **k):
        if "INSERT INTO captures" in str(query):
            raise psycopg.OperationalError("server closed the connection unexpectedly")
        return orig(self, query, *a, **k)
    return execute


def _commit_applied_ack_lost(orig):
    def commit(self):
        orig(self)
        raise psycopg.OperationalError("server closed the connection unexpectedly")
    return commit


@pytest.mark.parametrize("target,attr,make,row_expected", [
    (psycopg.Cursor, "execute", _insert_fails, False),
    (psycopg.Connection, "commit", _commit_applied_ack_lost, True),
], ids=["insert-fails-not-committed", "commit-applied-ack-lost"])
def test_db_failure_keeps_image_and_logs(client, sid, broadcasts, other_file, monkeypatch, caplog,
                                         target, attr, make, row_expected):
    other, digest = other_file
    f0 = files()
    monkeypatch.setattr(target, attr, make(getattr(target, attr)))
    with caplog.at_level(logging.ERROR):
        r = capture(client, sid)
    monkeypatch.undo()
    assert r.status_code == 500  # original error still surfaces
    new = files() - f0
    assert len(new) == 1  # this attempt's image is kept in both cases
    name = next(iter(new)).name
    assert any("possible orphan" in m and name in m for m in caplog.messages)
    assert (len(rows(sid)) == 1) is row_expected  # the commit outcome really differs ...
    if row_expected:
        assert rows(sid)[0].image_path == name  # ... and the committed row still has its image
    assert mem(sid) == (0, 0, None, None) and broadcasts.empty()
    assert hashlib.sha256(other.read_bytes()).hexdigest() == digest


def test_logging_failure_does_not_mask_db_error(client, sid, monkeypatch):
    """Cleanup/logging problems must not replace the original DB error."""
    monkeypatch.setattr(psycopg.Cursor, "execute", _insert_fails(psycopg.Cursor.execute))

    def broken_error(*a, **k):
        raise RuntimeError("logging backend down")
    monkeypatch.setattr(A.log, "error", broken_error)
    c = TestClient(app, raise_server_exceptions=True)
    with pytest.raises(Exception) as ei:
        c.post(f"/api/sessions/{sid}/analyze", files={"frame": ("f.jpg", _jpeg(), "image/jpeg")}, data=ROI)
    assert "server closed the connection unexpectedly" in str(ei.value)
