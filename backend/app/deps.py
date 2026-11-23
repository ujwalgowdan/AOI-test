from __future__ import annotations

import hmac
import os
import threading
import time

from fastapi import Header, HTTPException, Query, Request, status

from app.adapters import legacy

# Brute-force brake on the admin password. In-memory, per client IP.
# ponytail: single-process store; behind the Vite/nginx proxy every browser
# shares one IP, so the lockout is effectively station-wide. Move to a shared
# store if the backend ever runs multi-worker.
FAIL_DELAY_S = 0.5
MAX_FAILURES = 5
LOCKOUT_S = 60.0
_failures: dict[str, tuple[int, float]] = {}  # ip -> (count, locked_until)
_lock = threading.Lock()


def require_admin(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Bearer-token gate. Token is the value of ADMIN_PASSWORD in `.env`."""
    expected = legacy.config.ADMIN_PASSWORD
    if expected in legacy.config.WEAK_ADMIN_PASSWORDS:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Admin disabled: set a strong ADMIN_PASSWORD in .env",
        )

    ip = request.client.host if request.client else "unknown"
    with _lock:
        count, locked_until = _failures.get(ip, (0, 0.0))
    wait = locked_until - time.monotonic()
    if wait > 0:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts, try again in {int(wait) + 1} s",
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    provided = authorization.removeprefix("Bearer ").strip()
    if hmac.compare_digest(provided.encode(), expected.encode()):
        with _lock:
            _failures.pop(ip, None)
        return

    time.sleep(FAIL_DELAY_S)  # sync dependency -> runs in the threadpool
    with _lock:
        count = _failures.get(ip, (0, 0.0))[0] + 1
        if count >= MAX_FAILURES:
            _failures[ip] = (0, time.monotonic() + LOCKOUT_S)
        else:
            _failures[ip] = (count, 0.0)
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid admin token")


# ---------- Station token (F-05), off by default ----------
# ponytail: VITE_STATION_TOKEN ships in the JS bundle, so this stops scripts
# and stray LAN clients, not someone who opens the UI. Real fix = Stage 6
# (don't publish ports) or per-user login.
def station_mode() -> bool:
    return os.getenv("AOI_REQUIRE_STATION_TOKEN", "").strip().lower() in {"1", "true", "yes", "on"}


def station_token_ok(provided: str | None) -> bool:
    expected = os.getenv("AOI_STATION_TOKEN", "").strip()
    return bool(expected) and bool(provided) and hmac.compare_digest(
        provided.encode(), expected.encode()
    )


def require_station_token(
    x_station_token: str | None = Header(default=None),
    station_token: str | None = Query(default=None, include_in_schema=False),
) -> None:
    """Header for fetch; `?station_token=` for <img>/<a> and WebSocket."""
    if not station_mode():
        return
    if not os.getenv("AOI_STATION_TOKEN", "").strip():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Station token required but AOI_STATION_TOKEN is not set",
        )
    if not station_token_ok(x_station_token or station_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid station token")


def require_admin_if_station_mode(
    request: Request, authorization: str | None = Header(default=None)
) -> None:
    if station_mode():
        require_admin(request, authorization)
