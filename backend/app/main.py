"""FastAPI entrypoint for the AOI backend."""

from __future__ import annotations

import logging
import threading
from collections.abc import Sequence
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import _bootstrap  # noqa: F401 — must run before legacy imports
from app.db.init import init_db
from app.adapters import legacy  # noqa: F401 — triggers manager construction
from app.deps import require_station_token
from app.routers import (
    analyze,
    auth,
    captures,
    chat,
    daily,
    detect,
    employees,
    inspectors,
    reports,
    sessions,
    ws,
)
from app.services.chat import llm as chat_llm
from app.services.session_manager import sessions as session_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aoi")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create tables + run the one-shot JSON→DB migration. Required before
    # any router touches `legacy.employees / inspectors / daily_counts`.
    init_db()
    # Chat: load the Ollama model in the background (no-op unless OLLAMA_URL is set).
    threading.Thread(target=chat_llm.warm, name="chat-warm", daemon=True).start()
    yield
    # Read by scripts/backup-aoi.ps1 to report sessions cut off by a stop.
    st = session_store.stats()
    log.info(
        "AOI_SHUTDOWN active_sessions=%d websocket_clients=%d",
        st["active_sessions"], st["websocket_clients"],
    )


app = FastAPI(
    title="AOI Backend",
    description="REST + WebSocket API replacing the Streamlit UI of the Innotech AOI system.",
    version="3.0.0",
    lifespan=lifespan,
)

# No CORS middleware (F-16): every UI reaches the API same-origin through the
# Vite (dev) or nginx (prod) proxy, so no cross-origin grant is needed.


@app.get("/healthz", tags=["meta"])
def healthz() -> dict[str, str]:
    return {"status": "ok"}


_LOOPBACK = {"127.0.0.1", "::1"}
# uvicorn's proxy-header handling rewrites request.client from X-Forwarded-For
# when the connecting peer is in FORWARDED_ALLOW_IPS (default loopback, but it
# can be widened, even to "*"). It only rewrites when that header is present,
# so refusing every forwarding header means request.client IS the socket peer.
_FORWARDING_HEADERS = ("x-forwarded-for", "x-forwarded-host", "x-real-ip", "forwarded")


@app.get("/internal/active-sessions", include_in_schema=False)
def internal_active_sessions(request: Request) -> dict[str, int]:
    """Session guard for scripts/backup-aoi.ps1: counts only.

    Callable only from inside the backend container (`docker compose exec`):
    the connection peer must be loopback and no forwarding header may be
    present. Outside /api, so neither nginx nor the Vite proxy forwards it.
    """
    peer = request.client.host if request.client else ""
    if peer not in _LOOPBACK or any(h in request.headers for h in _FORWARDING_HEADERS):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    return session_store.stats()


def _sanitize_errors(errors: Sequence[Any]) -> list[dict]:
    """Drop or stringify non-JSON-encodable fields (notably the raw `input`
    bytes that Pydantic attaches when the request body fails to parse as
    JSON). Without this the 422 response itself crashes with 500 during
    json.dumps."""
    cleaned: list[dict] = []
    for e in errors:
        item = {k: v for k, v in e.items() if k != "input"}
        raw = e.get("input")
        if isinstance(raw, (bytes, bytearray)):
            try:
                item["input"] = raw.decode("utf-8", errors="replace")[:200]
            except Exception:
                item["input"] = "<unprintable bytes>"
        elif isinstance(raw, (str, int, float, bool, type(None), list, dict)):
            item["input"] = raw
        # else: drop unrepresentable types entirely.
        cleaned.append(item)
    return cleaned


@app.exception_handler(RequestValidationError)
async def _log_validation_errors(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Log the raw body on 422 so the operator's toast and the server log
    agree on what was wrong. Matches FastAPI's default response shape so
    the frontend's `formatDetail()` parsing keeps working."""
    body_bytes = b""
    try:
        body_bytes = await request.body()
    except Exception:
        pass
    # Debug-level so production logs don't fill up with every form
    # rejection. Flip the root logger to DEBUG (or set LOG_LEVEL=DEBUG)
    # to see the raw body when reproducing a 422.
    log.debug(
        "422 on %s %s — errors=%s body=%r",
        request.method, request.url.path, exc.errors(), body_bytes[:512],
    )
    return JSONResponse(status_code=422, content={"detail": _sanitize_errors(exc.errors())})


# F-05: no-op unless AOI_REQUIRE_STATION_TOKEN is on (see app/deps.py).
_station = [Depends(require_station_token)]

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(inspectors.router)
app.include_router(sessions.router, dependencies=_station)
app.include_router(analyze.router, dependencies=_station)
app.include_router(detect.router, dependencies=_station)
app.include_router(captures.router, dependencies=_station)
app.include_router(daily.router, dependencies=_station)
app.include_router(reports.router, dependencies=_station)
app.include_router(chat.router, dependencies=_station)
app.include_router(ws.router)
