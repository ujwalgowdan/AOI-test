"""`PUT /api/inspectors/{id}` (F-01). Needs Postgres; skips otherwise.

    docker compose exec backend pytest tests/test_inspector_update.py

Uses uuid-tagged IDs and deletes them afterwards, so it is safe on the dev DB.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

try:
    from app.adapters import legacy
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)


@pytest.fixture(scope="module", autouse=True)
def db_or_skip():
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Inspector).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")


@pytest.fixture
def ids():
    tag = uuid.uuid4().hex[:8]
    made = {"a": f"IN_UP_{tag}_a", "b": f"IN_UP_{tag}_b", "new": f"IN_UP_{tag}_n",
            "op": f"OP_UP_{tag}"}
    with SessionLocal() as db:
        db.add_all([
            models.Inspector(id=made["a"], name="Alpha"),
            models.Inspector(id=made["b"], name="Bravo"),
        ])
        db.commit()
    yield made
    with SessionLocal() as db:
        db.execute(delete(models.Capture).where(models.Capture.operator_id == made["op"]))
        db.execute(delete(models.Operator).where(models.Operator.id == made["op"]))
        db.execute(delete(models.Inspector).where(models.Inspector.id.like(f"IN_UP_{tag}%")))
        db.commit()


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {legacy.config.ADMIN_PASSWORD}"
    return c


def _name(ins_id: str):
    found = legacy.inspectors.get_inspector_by_id(ins_id)
    return found and found["name"]


def test_rename_persists(client, ids):
    r = client.put(f"/api/inspectors/{ids['a']}", json={"name": "Alpha Two"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": ids["a"], "name": "Alpha Two"}
    assert _name(ids["a"]) == "Alpha Two"


def test_unknown_id_is_404(client, ids):
    r = client.put(f"/api/inspectors/{ids['a']}_missing", json={"name": "X"})
    assert r.status_code == 404


def test_duplicate_id_is_409(client, ids):
    r = client.put(f"/api/inspectors/{ids['a']}", json={"id": ids["b"], "name": "Z"})
    assert r.status_code == 409
    assert _name(ids["a"]) == "Alpha" and _name(ids["b"]) == "Bravo"


def test_id_change_without_history(client, ids):
    r = client.put(f"/api/inspectors/{ids['a']}", json={"id": ids["new"]})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": ids["new"], "name": "Alpha"}
    assert _name(ids["a"]) is None


def test_id_change_with_history_is_refused(client, ids):
    with SessionLocal() as db:
        db.add(models.Operator(id=ids["op"], name="Op"))
        db.flush()
        db.add(models.Capture(
            session_id=f"sess_{ids['op']}", operator_id=ids["op"], inspector_id=ids["a"],
            result="OK", detected_order=["yellow", "green"],
            expected_order=["yellow", "green"], image_path="none.jpg",
        ))
        db.commit()
    r = client.put(f"/api/inspectors/{ids['a']}", json={"id": ids["new"], "name": "Q"})
    assert r.status_code == 409
    assert "history" in r.json()["detail"]
    assert _name(ids["a"]) == "Alpha" and _name(ids["new"]) is None
