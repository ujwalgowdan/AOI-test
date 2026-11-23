"""F-16: no cross-origin grants. Every UI reaches the API same-origin through a
proxy (Vite in dev, nginx in production), so the backend grants CORS to nobody.

CORS only governs what a browser lets a *script on another origin* read, and
whether it sends preflighted requests. It is not authentication: simple
requests from any origin still execute server-side, and admin routes stay
protected by the bearer token. Needs Postgres for the DB-backed cases (skips
otherwise).
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

try:
    from app import deps
    from app.adapters import legacy
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)

UI_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "https://localhost:5173"]
DISALLOWED = ["https://evil.example", "http://192.168.1.10:5173"]  # foreign site; LAN page calling loopback
ALL_ORIGINS = UI_ORIGINS + DISALLOWED


@pytest.fixture(scope="module", autouse=True)
def db_or_skip():
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Inspector).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(deps, "FAIL_DELAY_S", 0.0)
    deps._failures.clear()
    yield TestClient(app, raise_server_exceptions=False)
    deps._failures.clear()


@pytest.fixture
def admin():
    return {"Authorization": f"Bearer {legacy.config.ADMIN_PASSWORD}"}


@pytest.fixture
def people(client, admin):
    t = f"C{uuid.uuid4().hex[:8]}"
    assert client.post("/api/employees", json={"id": f"{t}E", "name": "Op"}, headers=admin).status_code == 201
    assert client.post("/api/inspectors", json={"id": f"{t}I", "name": "Insp"}, headers=admin).status_code == 201
    yield f"{t}E", f"{t}I"
    with SessionLocal() as db:
        db.execute(delete(models.SessionRow).where(models.SessionRow.operator_id.like(f"{t}%")))
        db.execute(delete(models.Operator).where(models.Operator.id.like(f"{t}%")))
        db.execute(delete(models.Inspector).where(models.Inspector.id.like(f"{t}%")))
        db.commit()


def cors_headers(r):
    return {k: v for k, v in r.headers.items() if k.lower().startswith("access-control")}


RANGE = {"start": "2026-01-01T00:00:00", "end": "2026-01-02T00:00:00"}

# (method, path, kwargs) for ordinary requests whose status must not depend on Origin
READS = [
    ("GET", "/healthz", {}),
    ("GET", "/api/employees", {}),
    ("GET", "/api/inspectors", {}),
    ("GET", "/api/daily/summary", {}),
    ("GET", "/api/captures/nope_20260101.jpg", {}),
    ("GET", "/api/sessions/does-not-exist", {}),
    ("POST", "/api/reports/range/generate", {"json": RANGE}),
]


# ---------- A. UI access keeps working (same status with or without Origin) ----------

@pytest.mark.parametrize("origin", UI_ORIGINS)
@pytest.mark.parametrize("method,path,kw", READS, ids=[f"{m} {p}" for m, p, _ in READS])
def test_ui_origin_status_unchanged(client, origin, method, path, kw):
    plain = client.request(method, path, **kw).status_code
    assert client.request(method, path, headers={"Origin": origin}, **kw).status_code == plain


@pytest.mark.parametrize("origin", UI_ORIGINS)
def test_ui_origin_admin_flow(client, admin, origin):
    """Admin add/rename/delete with an Origin header, as the proxied UI sends it."""
    h = {**admin, "Origin": origin}
    pid = f"C{uuid.uuid4().hex[:8]}"
    assert client.get("/api/auth/verify", headers=h).status_code == 204
    assert client.post("/api/inspectors", json={"id": pid, "name": "A"}, headers=h).status_code == 201
    assert client.put(f"/api/inspectors/{pid}", json={"name": "B"}, headers=h).json()["name"] == "B"
    assert client.delete(f"/api/inspectors/{pid}", headers=h).status_code == 204


# ---------- B. Preflights: never granted, for any origin ----------

PREFLIGHTS = [
    ("/api/employees/x", "DELETE", "authorization"),
    ("/api/inspectors/x", "PUT", "authorization,content-type"),
    ("/api/inspectors", "POST", "authorization,content-type"),
    ("/api/sessions/start", "POST", "content-type"),
    ("/api/reports/range/generate", "POST", "content-type"),
    ("/api/captures/download/zip", "GET", "authorization"),
    ("/api/employees", "GET", "x-station-token"),
]


@pytest.mark.parametrize("origin", ALL_ORIGINS)
@pytest.mark.parametrize("path,method,req_headers", PREFLIGHTS, ids=[f"{m} {p}" for p, m, _ in PREFLIGHTS])
def test_preflight_not_granted(client, origin, path, method, req_headers):
    r = client.options(path, headers={
        "Origin": origin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": req_headers,
    })
    assert cors_headers(r) == {}
    assert not 200 <= r.status_code < 300


# ---------- C. Disallowed origins: no grant headers, status unchanged ----------

@pytest.mark.parametrize("origin", DISALLOWED)
@pytest.mark.parametrize("method,path,kw", READS, ids=[f"{m} {p}" for m, p, _ in READS])
def test_disallowed_origin_gets_no_cors_headers(client, origin, method, path, kw):
    plain = client.request(method, path, **kw).status_code
    r = client.request(method, path, headers={"Origin": origin}, **kw)
    assert r.status_code == plain
    assert cors_headers(r) == {}


# ---------- D. CORS is not authentication ----------

@pytest.mark.parametrize("origin", DISALLOWED)
def test_admin_routes_still_gated_by_token(client, admin, origin):
    o = {"Origin": origin}
    assert client.delete("/api/inspectors/nobody", headers=o).status_code == 401
    assert client.delete("/api/inspectors/nobody", headers={**o, "Authorization": "Bearer wrong"}).status_code == 403
    assert client.delete("/api/inspectors/nobody", headers={**o, **admin}).status_code == 404  # auth passed, handler ran
    assert client.get("/api/captures/download/zip?start=2026-01-01&end=2026-01-01", headers=o).status_code == 401


@pytest.mark.parametrize("origin", DISALLOWED)
def test_simple_post_still_executes_server_side(client, people, origin):
    """A cross-origin simple POST (no preflight) still runs: CORS only hides the response."""
    emp, insp = people
    sid = client.post("/api/sessions/start", json={"employee_id": emp, "inspector_id": insp}).json()["id"]
    r = client.post(f"/api/sessions/{sid}/stop", headers={"Origin": origin})
    assert r.status_code == 200
    assert cors_headers(r) == {}
    assert client.get(f"/api/sessions/{sid}").json()["active"] is False  # side effect happened


@pytest.mark.parametrize("origin", DISALLOWED)
def test_multipart_peek_still_executes(client, origin):
    r = client.post("/api/detect/peek", headers={"Origin": origin},
                    files={"frame": ("f.jpg", b"not a jpeg", "image/jpeg")})
    plain = client.post("/api/detect/peek", files={"frame": ("f.jpg", b"not a jpeg", "image/jpeg")})
    assert r.status_code == plain.status_code == 400  # handler ran and rejected the frame
    assert cors_headers(r) == {}


@pytest.mark.parametrize("ctype", ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])
@pytest.mark.parametrize("path,body", [
    ("/api/sessions/start", '{"employee_id":"a","inspector_id":"b"}'),
    ("/api/reports/range/generate", '{"start":"2026-01-01T00:00:00","end":"2026-01-02T00:00:00"}'),
], ids=["sessions-start", "range-generate"])
def test_json_routes_reject_simple_content_types(client, path, body, ctype):
    """No preflight bypass: JSON routes sent as a CORS-simple content type are rejected."""
    r = client.post(path, content=body, headers={"Content-Type": ctype, "Origin": DISALLOWED[0]})
    assert r.status_code == 422
