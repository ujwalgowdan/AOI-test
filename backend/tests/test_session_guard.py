"""/internal/active-sessions (backup session guard). No DB needed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.session_manager import sessions

URL = "/internal/active-sessions"
EMP = {"id": "E1", "name": "Op"}
INS = {"id": "I1", "name": "Insp"}


@pytest.fixture(autouse=True)
def clean_store():
    sessions._sessions.clear()
    sessions._subscribers.clear()
    yield
    sessions._sessions.clear()
    sessions._subscribers.clear()


def local():
    return TestClient(app, client=("127.0.0.1", 50000))


def test_counts_active_sessions_and_dashboards():
    assert local().get(URL).json() == {"active_sessions": 0, "websocket_clients": 0}
    a = sessions.create(EMP, INS)
    b = sessions.create(EMP, INS)
    sessions.subscribe(a.id)
    sessions.subscribe(a.id)
    assert local().get(URL).json() == {"active_sessions": 2, "websocket_clients": 2}
    sessions.close(a.id)  # closed sessions and their dashboards no longer count
    assert local().get(URL).json() == {"active_sessions": 1, "websocket_clients": 0}
    assert b.id not in local().get(URL).text  # counts only, no ids


def test_ipv6_loopback_allowed():
    assert TestClient(app, client=("::1", 50000)).get(URL).status_code == 200


@pytest.mark.parametrize("peer", ["172.18.0.5", "192.168.1.15", "testclient"])
def test_non_loopback_peer_forbidden(peer):
    assert TestClient(app, client=(peer, 50000)).get(URL).status_code == 403


@pytest.mark.parametrize(
    "header",
    ["X-Forwarded-For", "X-Forwarded-Host", "X-Real-IP", "Forwarded"],
)
def test_any_forwarding_header_forbidden_even_from_loopback(header):
    r = local().get(URL, headers={header: "127.0.0.1"})
    assert r.status_code == 403
