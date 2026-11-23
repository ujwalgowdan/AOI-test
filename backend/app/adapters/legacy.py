"""Adapter seam between the routers and storage.

Pre-rewrite this re-exported the legacy `EmployeeManager` /
`InspectorManager` / `DailyCountManager` JSON-file managers. Post-rewrite
the storage moved to Postgres (see `app/db/`), but routers still call
`legacy.employees.add_employee(...)` etc., so this module exposes
DB-backed facades with the SAME method signatures the file-era managers
exposed. Router code didn't change.

Stateful legacy callers that aren't yet ported (PDF + email) keep
importing from `backend/legacy/` directly through this module.
"""

from __future__ import annotations

import threading
from typing import Optional, TypeVar

from sqlalchemy import func, select

from app import _bootstrap  # noqa: F401 — must run before legacy imports
from app.db import models
from app.db.engine import SessionLocal
from app.services.clock import now_ist

import config  # type: ignore
from email_sender import send_daily_report, send_email_report, test_email_connection  # type: ignore
from pdf_generator import generate_report_pdf  # type: ignore


DATA_DIR = _bootstrap.DATA_DIR

# Some legacy file ops (PDF write, email attachment staging) still touch
# disk and aren't transactional — keep a process-wide lock available so
# routers don't have to invent their own.
write_lock = threading.Lock()


# Shared people operations. `model` is always one of the two ORM classes
# hard-coded by the adapters below (never derived from a request); ids and
# names stay bound parameters. Messages are passed verbatim by each adapter.
_P = TypeVar("_P", models.Operator, models.Inspector)


def _list_people(model: type[_P]) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(select(model).order_by(model.id)).all()
        return [{"id": r.id, "name": r.name} for r in rows]


def _get_person(model: type[_P], person_id: str) -> Optional[dict]:
    with SessionLocal() as db:
        row = db.get(model, person_id)
        return {"id": row.id, "name": row.name} if row else None


def _add_person(
    model: type[_P], name: str, person_id: str, *, exists: str, added: str
) -> tuple[bool, str]:
    with SessionLocal() as db:
        if db.get(model, person_id):
            return False, exists
        db.add(model(id=person_id, name=name))
        db.commit()
        return True, added


def _remove_person(
    model: type[_P], person_id: str, *, missing: str, has_history: str, removed: str
) -> tuple[bool, str]:
    with SessionLocal() as db:
        row = db.get(model, person_id)
        if row is None:
            return False, missing
        db.delete(row)
        try:
            db.commit()
        except Exception:
            db.rollback()
            # FK constraint: this person has captures or active sessions.
            return False, has_history
        return True, removed


class _OperatorAdapter:
    """File-era `EmployeeManager` interface, backed by `operators` table."""

    @staticmethod
    def get_all_employees() -> list[dict]:
        return _list_people(models.Operator)

    @staticmethod
    def get_employee_by_id(emp_id: str) -> Optional[dict]:
        return _get_person(models.Operator, emp_id)

    @staticmethod
    def add_employee(name: str, emp_id: str) -> tuple[bool, str]:
        return _add_person(
            models.Operator, name, emp_id,
            exists="Employee ID already exists",
            added="Employee added successfully",
        )

    @staticmethod
    def remove_employee(emp_id: str) -> tuple[bool, str]:
        return _remove_person(
            models.Operator, emp_id,
            missing="Employee not found",
            has_history="Operator has test history and cannot be removed",
            removed="Employee removed successfully",
        )


class _InspectorAdapter:
    """File-era `InspectorManager` interface, backed by `inspectors` table."""

    @staticmethod
    def get_all_inspectors() -> list[dict]:
        return _list_people(models.Inspector)

    @staticmethod
    def get_inspector_by_id(ins_id: str) -> Optional[dict]:
        return _get_person(models.Inspector, ins_id)

    @staticmethod
    def add_inspector(name: str, ins_id: str) -> tuple[bool, str]:
        return _add_person(
            models.Inspector, name, ins_id,
            exists="Inspector ID already exists",
            added="Inspector added successfully",
        )

    @staticmethod
    def update_inspector(
        ins_id: str, name: Optional[str] = None, new_id: Optional[str] = None
    ) -> tuple[str, str]:
        """Rename and/or re-key an inspector in one transaction.

        Returns (status, message), status in {"ok", "not_found", "conflict"}.
        `sessions`/`captures` FK `inspectors.id` without ON UPDATE CASCADE,
        so an ID change is refused once the inspector has history.
        """
        with SessionLocal() as db:
            row = db.get(models.Inspector, ins_id)
            if row is None:
                return "not_found", "Inspector not found"
            if new_id and new_id != ins_id:
                if db.get(models.Inspector, new_id):
                    return "conflict", "Inspector ID already exists"
                used = db.scalar(
                    select(func.count()).select_from(models.SessionRow)
                    .where(models.SessionRow.inspector_id == ins_id)
                ) or db.scalar(
                    select(func.count()).select_from(models.Capture)
                    .where(models.Capture.inspector_id == ins_id)
                )
                if used:
                    return "conflict", "Inspector has test history; ID cannot be changed"
                row.id = new_id
            if name:
                row.name = name
            db.commit()
            return "ok", "Inspector updated successfully"

    @staticmethod
    def remove_inspector(ins_id: str) -> tuple[bool, str]:
        return _remove_person(
            models.Inspector, ins_id,
            missing="Inspector not found",
            has_history="Inspector has test history and cannot be removed",
            removed="Inspector removed successfully",
        )


class _DailyCountsAdapter:
    """File-era `DailyCountManager` interface, backed by `captures` table.

    The legacy manager auto-rolled at midnight; here we just filter by
    `date(captured_at) = today`, so the same semantics fall out for free.
    """

    @staticmethod
    def get_test_count() -> int:
        with SessionLocal() as db:
            return db.scalar(
                select(func.count(models.Capture.id)).where(
                    func.date(models.Capture.captured_at) == func.current_date()
                )
            ) or 0

    @staticmethod
    def get_daily_summary() -> dict:
        with SessionLocal() as db:
            rows = db.scalars(
                select(models.Capture)
                .where(func.date(models.Capture.captured_at) == func.current_date())
                .order_by(models.Capture.captured_at)
            ).all()

            tests: list[dict] = []
            ok = 0
            fail = 0
            for idx, r in enumerate(rows, start=1):
                if r.result == "OK":
                    ok += 1
                elif r.result == "NOT OK":
                    fail += 1
                total = idx
                rate = round((ok / total * 100), 0) if total else 100.0
                tests.append({
                    "serial_no": idx,
                    "result": "Pass" if r.result == "OK" else ("Fail" if r.result == "NOT OK" else r.result),
                    "cumulative_pass_rate": rate,
                    "employee_id": r.operator_id,
                    "employee_name": r.operator.name if r.operator else "",
                    "inspector_name": r.inspector.name if r.inspector else "",
                    "start_time": r.captured_at.strftime("%I:%M:%S %p"),
                    "end_time": r.captured_at.strftime("%I:%M:%S %p"),
                    "timestamp": r.captured_at.strftime("%Y-%m-%d %H:%M:%S"),
                })

            total = len(rows)
            cumulative_rate = round((ok / total * 100), 0) if total else 100.0
            return {
                "date": now_ist().strftime("%Y-%m-%d"),
                "tests": tests,
                "summary": {
                    "total_count": total,
                    "pass_count": ok,
                    "fail_count": fail,
                    "cumulative_pass_rate": cumulative_rate,
                },
            }


employees = _OperatorAdapter()
inspectors = _InspectorAdapter()
daily_counts = _DailyCountsAdapter()


__all__ = [
    "config",
    "employees",
    "inspectors",
    "daily_counts",
    "generate_report_pdf",
    "send_daily_report",
    "send_email_report",
    "test_email_connection",
    "write_lock",
    "DATA_DIR",
]
