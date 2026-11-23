from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.adapters import legacy  # noqa: F401 — kept for parity with other routers
from app.db import models
from app.db.engine import SessionLocal
from app.schemas import SessionStart, SessionState
from app.services.clock import now_ist
from app.services.session_manager import sessions

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/start", response_model=SessionState, status_code=status.HTTP_201_CREATED)
def start_session(body: SessionStart) -> SessionState:
    employee = legacy.employees.get_employee_by_id(body.employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown employee_id")
    inspector = legacy.inspectors.get_inspector_by_id(body.inspector_id)
    if not inspector:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown inspector_id")

    s = sessions.create(employee, inspector)

    # Persist the session so /api/reports/history can list past runs
    # without scanning the in-memory store.
    with SessionLocal() as db:
        db.add(
            models.SessionRow(
                id=s.id,
                operator_id=s.employee_id,
                inspector_id=s.inspector_id,
                started_at=s.start_time,
            )
        )
        db.commit()

    return SessionState(**s.as_dict())


@router.get("/{sid}", response_model=SessionState)
def get_session(sid: str) -> SessionState:
    s = sessions.get(sid)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")
    return SessionState(**s.as_dict())


@router.post("/{sid}/stop", response_model=SessionState)
def stop_session(sid: str) -> SessionState:
    s = sessions.close(sid)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")

    # Stamp the session's end. Per-cable rows were already inserted into
    # `captures` during /analyze, so there's no fan-out to do here —
    # daily_counts.get_daily_summary() reconstructs the per-cable history
    # from `captures` filtered by today's date.
    with SessionLocal() as db:
        row = db.get(models.SessionRow, sid)
        if row is not None:
            row.ended_at = s.end_time or now_ist()
            db.commit()

    return SessionState(**s.as_dict())
