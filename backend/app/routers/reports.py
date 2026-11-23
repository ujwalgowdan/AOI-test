from __future__ import annotations

from datetime import datetime, time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.adapters import legacy
from app.deps import require_admin_if_station_mode
from app.services.clock import IST, now_ist
from app.db import models
from app.db.engine import SessionLocal

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _captures_to_report_data(rows: list[models.Capture], date_label: str) -> dict[str, Any]:
    """Build the `report_data` dict that legacy `generate_report_pdf` expects.

    Shared by the daily endpoint and the custom-range endpoint so the two
    paths can't drift. `date_label` is what appears under "Date:" on the
    PDF — for daily it's today; for ranges it's "<start> to <end>".
    """
    tests: list[dict] = []
    ok = 0
    fail = 0
    for idx, r in enumerate(rows, start=1):
        if r.result == "OK":
            ok += 1
        elif r.result == "NOT OK":
            fail += 1
        rate = round((ok / idx * 100), 0) if idx else 100.0
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

    employee_name = tests[-1]["employee_name"] if tests else ""
    employee_id = tests[-1]["employee_id"] if tests else ""
    inspector_name = tests[-1]["inspector_name"] if tests else ""
    start_time = tests[0]["start_time"] if tests else ""
    end_time = tests[-1]["end_time"] if tests else ""

    return {
        "date": date_label,
        "time": now_ist().strftime("%H:%M:%S"),
        "employee_name": employee_name,
        "employee_id": employee_id,
        "inspector_name": inspector_name,
        "tests": tests,
        "total_tested": len(rows),
        "ok_count": ok,
        "not_ok_count": fail,
        "start_time": start_time,
        "end_time": end_time,
    }


class RangeReportRequest(BaseModel):
    # ISO 8601, naive or tz-aware. The browser's <input type="datetime-local">
    # emits "YYYY-MM-DDTHH:MM" which Pydantic parses cleanly to datetime.
    # If only a date is given, normalise to start-of-day / end-of-day below.
    #
    # We deliberately do NOT use a `field_validator` to compare start/end:
    # raising ValueError there causes Pydantic to attach the exception to
    # `ctx.error`, which `_sanitize_errors` in app/main.py doesn't strip,
    # and the 422 response then fails to JSON-encode and becomes a 500.
    # Checking in the handler with HTTPException(400) sidesteps that.
    start: datetime
    end: datetime


@router.post("/range/generate", dependencies=[Depends(require_admin_if_station_mode)])
def generate_range_pdf(req: RangeReportRequest) -> FileResponse:
    """Generate a PDF over an arbitrary [start, end] datetime window.

    Pulls captures from Postgres directly so the report reflects the
    requested range — the legacy `daily_counts.get_daily_summary()` is
    fixed to today and can't service this endpoint.
    """
    # Exactly one bound naive (e.g. a datetime-local value next to an
    # offset-aware one): express the aware bound as naive IST wall-clock.
    # Naive already means IST here (the DB engine pins every session to
    # Asia/Kolkata), so the request then behaves exactly like an all-naive
    # IST request: same instants, and the end-of-day rule and date label
    # below use IST dates/midnight. All-naive and all-aware requests are
    # left as they are.
    start_dt = req.start
    end_dt = req.end
    if (start_dt.tzinfo is None) != (end_dt.tzinfo is None):
        if start_dt.tzinfo is not None:
            start_dt = start_dt.astimezone(IST).replace(tzinfo=None)
        else:
            end_dt = end_dt.astimezone(IST).replace(tzinfo=None)

    if end_dt < start_dt:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "end must be on or after start")

    # If the caller passed midnight for `end` (e.g. picked a date without
    # a time), treat it as end-of-day so the window includes the whole
    # day. Same convention captures.download_captures uses.
    if end_dt.time() == time.min and start_dt.time() == time.min and start_dt.date() != end_dt.date():
        end_dt = datetime.combine(end_dt.date(), time.max)

    with SessionLocal() as db:
        rows = db.scalars(
            select(models.Capture)
            .where(models.Capture.captured_at >= start_dt)
            .where(models.Capture.captured_at <= end_dt)
            .order_by(models.Capture.captured_at)
        ).all()

    if start_dt.date() == end_dt.date():
        date_label = start_dt.strftime("%Y-%m-%d")
    else:
        date_label = f"{start_dt.strftime('%Y-%m-%d %H:%M')} to {end_dt.strftime('%Y-%m-%d %H:%M')}"

    data = _captures_to_report_data(list(rows), date_label)
    pdf_path = legacy.generate_report_pdf(data, save_to_downloads=False)
    if not pdf_path or not Path(pdf_path).exists():
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "PDF generation failed")
    return FileResponse(pdf_path, media_type="application/pdf", filename=Path(pdf_path).name)
