"""C-02 (batch 3): operator/inspector names longer than the 255-character DB
column (varchar(255), UTF8 -> counted in Unicode code points) must get a clean
422 instead of a 500. Needs Postgres (skips otherwise).

Corrected: >255 code points on POST /api/employees, POST /api/inspectors and
PUT /api/inspectors/{id}. Unchanged: names up to 255 code points (any Unicode),
create's min_length=1, and rename with an omitted / null / empty name (no-op).
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

COMBINING = "é"  # 2 code points, 1 visible letter
OK_255 = {
    "ascii": "a" * 255,
    "two_byte": "é" * 255,
    "four_byte_emoji": "\U0001F600" * 255,
    "combining_255_code_points": COMBINING * 127 + "x",
}
TOO_LONG_256 = {
    "ascii": "a" * 256,
    "two_byte": "é" * 256,
    "four_byte_emoji": "\U0001F600" * 256,
    "combining_256_code_points": COMBINING * 128,  # only 128 visible letters
}


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
def tag():
    t = f"N{uuid.uuid4().hex[:8]}"
    yield t
    with SessionLocal() as db:
        db.execute(delete(models.Operator).where(models.Operator.id.like(f"{t}%")))
        db.execute(delete(models.Inspector).where(models.Inspector.id.like(f"{t}%")))
        db.commit()


def stored_name(kind, pid):
    getter = legacy.employees.get_employee_by_id if kind == "employees" else legacy.inspectors.get_inspector_by_id
    row = getter(pid)
    return row and row["name"]


# ---------- unchanged: up to 255 code points accepted and stored exactly ----------

@pytest.mark.parametrize("kind", ["employees", "inspectors"])
@pytest.mark.parametrize("case", list(OK_255))
def test_create_255_code_points_accepted(client, tag, kind, case):
    name = OK_255[case]
    assert len(name) == 255
    r = client.post(f"/api/{kind}", json={"id": f"{tag}{case[:6]}", "name": name})
    assert r.status_code == 201, r.text[:120]
    assert stored_name(kind, f"{tag}{case[:6]}") == name


# ---------- corrected: >255 code points -> 422, nothing stored ----------

@pytest.mark.parametrize("kind", ["employees", "inspectors"])
@pytest.mark.parametrize("case", list(TOO_LONG_256))
def test_create_256_code_points_is_422(client, tag, kind, case):
    name = TOO_LONG_256[case]
    assert len(name) == 256
    r = client.post(f"/api/{kind}", json={"id": f"{tag}{case[:6]}", "name": name})
    assert r.status_code == 422, r.text[:120]
    assert r.json()["detail"][0]["type"] == "string_too_long"
    assert stored_name(kind, f"{tag}{case[:6]}") is None


@pytest.mark.parametrize("kind", ["employees", "inspectors"])
def test_create_empty_name_still_422_too_short(client, tag, kind):
    r = client.post(f"/api/{kind}", json={"id": f"{tag}E", "name": ""})
    assert r.status_code == 422
    assert r.json()["detail"][0]["type"] == "string_too_short"


# ---------- rename (PUT /api/inspectors/{id}) ----------

@pytest.fixture
def inspector(client, tag):
    pid = f"{tag}I"
    assert client.post("/api/inspectors", json={"id": pid, "name": "Orig"}).status_code == 201
    return pid


def test_rename_255_accepted(client, inspector):
    r = client.put(f"/api/inspectors/{inspector}", json={"name": "b" * 255})
    assert r.status_code == 200
    assert stored_name("inspectors", inspector) == "b" * 255


@pytest.mark.parametrize("case", list(TOO_LONG_256))
def test_rename_256_code_points_is_422_and_unchanged(client, inspector, case):
    r = client.put(f"/api/inspectors/{inspector}", json={"name": TOO_LONG_256[case]})
    assert r.status_code == 422, r.text[:120]
    assert r.json()["detail"][0]["type"] == "string_too_long"
    assert stored_name("inspectors", inspector) == "Orig"


@pytest.mark.parametrize("body", [{}, {"name": None}, {"name": ""}], ids=["omitted", "null", "empty"])
def test_rename_omitted_null_empty_is_noop(client, inspector, body):
    r = client.put(f"/api/inspectors/{inspector}", json=body)
    assert r.status_code == 200
    assert r.json() == {"id": inspector, "name": "Orig"}
