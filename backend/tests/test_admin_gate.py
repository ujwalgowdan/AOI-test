"""`require_admin` hardening (F-04). No DB needed: /api/auth/verify is pure auth."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.adapters import legacy
from app.main import app

STRONG = "s3cure-Test-Pass!"
URL = "/api/auth/verify"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(legacy.config, "ADMIN_PASSWORD", STRONG)
    monkeypatch.setattr(deps, "FAIL_DELAY_S", 0.0)
    deps._failures.clear()
    yield TestClient(app)
    deps._failures.clear()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("weak", ["", "admin123", "change-me-please"])
def test_weak_password_disables_admin(client, monkeypatch, weak):
    monkeypatch.setattr(legacy.config, "ADMIN_PASSWORD", weak)
    r = client.get(URL, headers=bearer(weak))
    assert r.status_code == 503
    assert "ADMIN_PASSWORD" in r.json()["detail"]


def test_correct_password(client):
    assert client.get(URL, headers=bearer(STRONG)).status_code == 204


def test_missing_token_is_401(client):
    assert client.get(URL).status_code == 401


def test_wrong_password_is_delayed(client, monkeypatch):
    monkeypatch.setattr(deps, "FAIL_DELAY_S", 0.5)
    t0 = time.monotonic()
    r = client.get(URL, headers=bearer("nope"))
    assert r.status_code == 403
    assert time.monotonic() - t0 >= 0.5


def test_lockout_after_five_failures(client):
    for _ in range(deps.MAX_FAILURES):
        assert client.get(URL, headers=bearer("nope")).status_code == 403
    r = client.get(URL, headers=bearer(STRONG))  # even the right password waits
    assert r.status_code == 429
    assert "try again" in r.json()["detail"]


def test_success_resets_counter(client):
    for _ in range(deps.MAX_FAILURES - 1):
        client.get(URL, headers=bearer("nope"))
    assert client.get(URL, headers=bearer(STRONG)).status_code == 204
    for _ in range(deps.MAX_FAILURES - 1):
        assert client.get(URL, headers=bearer("nope")).status_code == 403
