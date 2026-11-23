"""F-24: operator/inspector IDs longer than the 64-char DB column must get a
clean 422, not a 500. Needs Postgres (skips otherwise, like the other DB tests).

Corrected cases: over-length `id` on POST /api/employees, POST /api/inspectors
and PUT /api/inspectors/{id} (body). Unchanged: the 64-char boundary and the
lookup-only paths (which already answer 404).
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

TOO_LONG = "X" * 65


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
    # Observe a 500 as a response instead of a raised exception.
    c = TestClient(app, raise_server_exceptions=False)
    c.headers["Authorization"] = f"Bearer {legacy.config.ADMIN_PASSWORD}"
    return c


@pytest.fixture
def ids():
    tag = uuid.uuid4().hex[:8]
    max64 = (f"L{tag}" + "M" * 64)[:64]
    yield {"tag": tag, "max64": max64}
    with SessionLocal() as db:
        db.execute(delete(models.Operator).where(models.Operator.id.like(f"L{tag}%")))
        db.execute(delete(models.Inspector).where(models.Inspector.id.like(f"L{tag}%")))
        db.commit()


# ---------- corrected cases: 500 -> 422 ----------

def test_add_employee_over_length_id_is_422(client, ids):
    r = client.post("/api/employees", json={"id": TOO_LONG, "name": "n"})
    assert r.status_code == 422, r.text


def test_add_inspector_over_length_id_is_422(client, ids):
    r = client.post("/api/inspectors", json={"id": TOO_LONG, "name": "n"})
    assert r.status_code == 422, r.text


def test_rekey_inspector_to_over_length_id_is_422(client, ids):
    assert client.post("/api/inspectors", json={"id": ids["max64"], "name": "n"}).status_code == 201
    r = client.put(f"/api/inspectors/{ids['max64']}", json={"id": TOO_LONG})
    assert r.status_code == 422, r.text
    assert legacy.inspectors.get_inspector_by_id(ids["max64"]) is not None  # unchanged


# ---------- unchanged: boundary and lookup-only paths ----------

def test_exactly_64_chars_still_accepted(client, ids):
    assert len(ids["max64"]) == 64
    assert client.post("/api/employees", json={"id": ids["max64"], "name": "n"}).status_code == 201
    assert client.post("/api/inspectors", json={"id": ids["max64"], "name": "n"}).status_code == 201


@pytest.mark.parametrize(("method", "path", "body", "detail"), [
    ("DELETE", f"/api/employees/{TOO_LONG}", None, "Employee not found"),
    ("DELETE", f"/api/inspectors/{TOO_LONG}", None, "Inspector not found"),
    ("PUT", f"/api/inspectors/{TOO_LONG}", {"name": "x"}, "Inspector not found"),
    ("POST", "/api/sessions/start", {"employee_id": TOO_LONG, "inspector_id": "INS001"}, "Unknown employee_id"),
])
def test_lookup_paths_unchanged_404(client, method, path, body, detail):
    r = client.request(method, path, json=body)
    assert (r.status_code, r.json()["detail"]) == (404, detail)


def test_session_start_over_length_inspector_unchanged_404(client, ids):
    # The employee must exist so the lookup reaches the inspector check.
    emp = f"L{ids['tag']}E"
    assert client.post("/api/employees", json={"id": emp, "name": "n"}).status_code == 201
    r = client.post("/api/sessions/start", json={"employee_id": emp, "inspector_id": TOO_LONG})
    assert (r.status_code, r.json()["detail"]) == (404, "Unknown inspector_id")
