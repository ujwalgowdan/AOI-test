"""Station-token gate (F-05), both modes. No DB: every gated call here is
rejected (or answered) before a SessionLocal is opened, except where we
stub the adapter."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import deps
from app.adapters import legacy
from app.main import app

TOKEN = "station-tok-123"
ADMIN = "s3cure-Test-Pass!"
GATED = [
    ("get", "/api/employees"),
    ("get", "/api/inspectors"),
    ("get", "/api/daily/summary"),
    ("get", "/api/sessions/nope"),
    ("post", "/api/sessions/nope/stop"),
    ("post", "/api/sessions/start"),
    ("post", "/api/sessions/nope/analyze"),
    ("post", "/api/detect/peek"),
    ("get", "/api/captures/x.jpg"),
    ("post", "/api/reports/range/generate"),
]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(legacy.config, "ADMIN_PASSWORD", ADMIN)
    monkeypatch.setattr(deps, "FAIL_DELAY_S", 0.0)
    monkeypatch.setattr(legacy.employees, "get_all_employees", lambda: [{"id": "E1", "name": "A"}])
    monkeypatch.setenv("AOI_STATION_TOKEN", TOKEN)
    deps._failures.clear()
    return TestClient(app)


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setenv("AOI_REQUIRE_STATION_TOKEN", "1")


# ---------- flag off: exactly today's behaviour ----------

def test_off_no_token_needed(client, monkeypatch):
    monkeypatch.delenv("AOI_REQUIRE_STATION_TOKEN", raising=False)
    assert client.get("/api/employees").status_code == 200
    # Gate is a no-op, so the route's own logic answers (404 unknown session).
    assert client.get("/api/sessions/nope").status_code == 404
    # Report route stays open when off: reaches validation, not auth.
    assert client.post("/api/reports/range/generate", json={}).status_code == 422


def test_off_websocket_connects_without_token(client, monkeypatch):
    monkeypatch.delenv("AOI_REQUIRE_STATION_TOKEN", raising=False)
    with client.websocket_connect("/ws/session/nope") as ws:
        assert ws.receive_json()["type"] == "error"  # unknown session, but accepted


# ---------- flag on ----------

@pytest.mark.parametrize(("method", "path"), GATED)
def test_on_without_token_is_401(client, on, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_on_wrong_token_is_401(client, on):
    r = client.get("/api/employees", headers={"X-Station-Token": "wrong"})
    assert r.status_code == 401


def test_on_header_works(client, on):
    r = client.get("/api/employees", headers={"X-Station-Token": TOKEN})
    assert r.status_code == 200
    assert client.get("/api/sessions/nope", headers={"X-Station-Token": TOKEN}).status_code == 404


def test_on_query_param_works_for_images(client, on):
    # Past the gate -> the route's own 404 for a missing file.
    assert client.get(f"/api/captures/missing.jpg?station_token={TOKEN}").status_code == 404


def test_on_token_unset_is_503(client, on, monkeypatch):
    monkeypatch.setenv("AOI_STATION_TOKEN", "")
    assert client.get("/api/employees").status_code == 503


def test_on_admin_mutations_unchanged(client, on):
    # Admin routes keep their own gate only (no station token needed).
    r = client.get("/api/auth/verify", headers={"Authorization": f"Bearer {ADMIN}"})
    assert r.status_code == 204


def test_on_report_needs_admin(client, on):
    st = {"X-Station-Token": TOKEN}
    assert client.post("/api/reports/range/generate", json={}, headers=st).status_code == 401
    r = client.post(
        "/api/reports/range/generate",
        json={},
        headers={**st, "Authorization": f"Bearer {ADMIN}"},
    )
    assert r.status_code == 422  # past both gates, into body validation


def test_on_websocket_rejects_without_token(client, on):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/session/nope") as ws:
            ws.receive_json()
    assert exc.value.code == 1008


def test_on_websocket_accepts_with_token(client, on):
    with client.websocket_connect(f"/ws/session/nope?station_token={TOKEN}") as ws:
        assert ws.receive_json()["type"] == "error"  # accepted; unknown session
