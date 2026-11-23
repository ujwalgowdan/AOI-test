"""Capture image access — single-file GET + admin-only ZIP bulk export."""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import date, datetime, time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select

from app.adapters import legacy
from app.db import models
from app.db.engine import SessionLocal
from app.deps import require_admin

router = APIRouter(prefix="/api/captures", tags=["captures"])

# Hard cap on rows pulled into a single ZIP. The current implementation
# builds the archive in memory (BytesIO) — fine for hundreds of files,
# would OOM the backend at hundreds of thousands. Clients that hit this
# narrow the date range. Switch to a streaming zip lib if this becomes a
# real constraint.
MAX_DOWNLOAD_ROWS = 5000


def _safe_capture_name(name: str) -> Path:
    """Return the on-disk path for a capture filename, rejecting traversal.

    Centralises the guard that used to live inline in `get_capture` so the
    bulk download path applies the same rules.
    """
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid name")
    return Path(legacy.DATA_DIR) / "detection_results" / name


# NOTE: this endpoint is declared before `/{name}` so the literal path
# wins the route match for `GET /api/captures/download/zip`. In practice
# `/{name}` only matches single-segment URLs so the order doesn't matter
# for the current routes, but keeping the more specific one first
# defends against a future single-segment `download` alias.
@router.get(
    "/download/zip",
    dependencies=[Depends(require_admin)],
    responses={200: {"content": {"application/zip": {}}}},
)
def download_captures(
    start: date = Query(..., description="Inclusive, YYYY-MM-DD"),
    end: date = Query(..., description="Inclusive, YYYY-MM-DD"),
    result: Literal["all", "OK", "NOT OK"] = Query("all"),
) -> Response:
    """Admin-only ZIP export of captured JPEGs + a manifest.csv.

    Filters rows on `captured_at` between [start, end] (inclusive) and
    optionally on `result`. Returns 413 when the matching row count
    exceeds `MAX_DOWNLOAD_ROWS` so the in-memory buffer can't be coerced
    into OOMing the backend. Missing JPEGs (row exists in DB, file is
    gone from disk) are recorded in the manifest with `present=no` —
    they don't break the export.
    """
    if start > end:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "start must be <= end")

    # `captured_at` is `timestamptz`; building naive datetimes here lets
    # Postgres apply its session tz uniformly — same convention the rest
    # of the codebase uses (see /api/reports/history's strftime calls).
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end, time.max)

    with SessionLocal() as db:
        stmt = (
            select(models.Capture)
            .where(models.Capture.captured_at >= start_dt)
            .where(models.Capture.captured_at <= end_dt)
            .order_by(models.Capture.captured_at)
        )
        if result != "all":
            stmt = stmt.where(models.Capture.result == result)

        rows = db.execute(stmt).scalars().all()
        if len(rows) > MAX_DOWNLOAD_ROWS:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Too many captures ({len(rows)} > {MAX_DOWNLOAD_ROWS}). "
                "Narrow the date range or apply a result filter.",
            )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            manifest = io.StringIO()
            writer = csv.writer(manifest)
            writer.writerow([
                "timestamp", "operator_id", "operator_name",
                "inspector_id", "inspector_name", "result",
                "detected", "expected", "filename", "present",
            ])
            for cap in rows:
                filename = cap.image_path or ""
                present = False
                if filename:
                    try:
                        path = _safe_capture_name(filename)
                    except HTTPException:
                        # Malformed filename in DB row — record it as
                        # missing in the manifest, don't crash the export.
                        path = None
                    if path is not None and path.exists():
                        zf.write(path, arcname=filename)
                        present = True
                writer.writerow([
                    cap.captured_at.strftime("%Y-%m-%d %H:%M:%S"),
                    cap.operator_id,
                    cap.operator.name if cap.operator else "",
                    cap.inspector_id,
                    cap.inspector.name if cap.inspector else "",
                    cap.result,
                    "|".join(cap.detected_order or []),
                    "|".join(cap.expected_order or []),
                    filename,
                    "yes" if present else "no",
                ])
            zf.writestr("manifest.csv", manifest.getvalue())

    archive_name = f"captures_{start.isoformat()}_to_{end.isoformat()}.zip"
    return Response(
        buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{archive_name}"'},
    )


@router.get("/{name}")
def get_capture(name: str) -> FileResponse:
    path = _safe_capture_name(name)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
    return FileResponse(path, media_type="image/jpeg")
