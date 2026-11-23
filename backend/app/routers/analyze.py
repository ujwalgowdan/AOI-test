from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import cv2

from fastapi import APIRouter, Form, HTTPException, UploadFile, status

from app.adapters import legacy
from app.db import models
from app.db.engine import SessionLocal
from app.schemas import AnalyzeResponse
from app.services import detector_core
from app.services.clock import now_ist
from app.services.session_manager import sessions

router = APIRouter(prefix="/api/sessions", tags=["analyze"])
log = logging.getLogger("aoi.capture")


def _log_error(msg: str, *args: object) -> None:
    """Log without ever replacing the error being handled."""
    try:
        log.error(msg, *args)
    except Exception:
        pass


def _partial_note(path: Path) -> str:
    try:
        return f"; partial file kept ({path.stat().st_size} bytes)" if path.exists() else ""
    except OSError:
        return ""


def _images_dir() -> Path:
    p = Path(legacy.DATA_DIR) / "detection_results"
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.post("/{sid}/analyze", response_model=AnalyzeResponse)
async def analyze_frame(
    sid: str,
    frame: UploadFile,
    roi_x: Optional[int] = Form(None),
    roi_y: Optional[int] = Form(None),
    roi_w: Optional[int] = Form(None),
    roi_h: Optional[int] = Form(None),
) -> AnalyzeResponse:
    session = sessions.get(sid)
    if not session or session.end_time is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session is not active")

    payload = await frame.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty frame upload")

    img = detector_core.decode_jpeg(payload)
    if img is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not decode JPEG")

    # The dashboard ships the cyan/blue alignment box in source-video
    # coordinates so colour detection only runs inside what the operator
    # saw. `evaluate_frame` clamps to the frame and falls back to a
    # centered ROI for legacy callers, so partial / missing rects are safe.
    roi = None
    if None not in (roi_x, roi_y, roi_w, roi_h):
        roi = (roi_x, roi_y, roi_w, roi_h)

    evaluation = detector_core.evaluate_frame(img, roi=roi)

    # Gate: if both expected wires aren't visible the result is "NOT DETECTED",
    # which must never be counted or captured. Don't write an image, insert a
    # `captures` row (the source of the daily count), bump counts, or broadcast —
    # just report the result back. The dashboard already blocks Space/Capture
    # until the readiness badge is READY; this is the server-side backstop that
    # also covers a probe-vs-capture race or a direct API call.
    if evaluation.result == "NOT DETECTED":
        return AnalyzeResponse(
            result=evaluation.result,
            detected_order=evaluation.detected_order,
            expected_order=evaluation.expected_order,
            image_url=None,
            ok_count=session.ok_count,
            not_ok_count=session.not_ok_count,
            centroids=[c.as_dict() for c in evaluation.centroids],
        )

    # Single IST timestamp shared by the burned-in overlay and the filename
    # so the image and its name always agree (and read IST, not container UTC).
    captured_ist = now_ist()

    # Annotated frames show the day's running count INCLUDING the current
    # capture, so add one to the pre-insert tally.
    daily_count = legacy.daily_counts.get_test_count() + 1
    annotated = detector_core.annotate_frame(
        img,
        evaluation,
        daily_count=daily_count,
        timestamp=captured_ist.strftime("%Y-%m-%d %H:%M:%S"),
    )

    # Persist the annotated image with the legacy naming convention.
    stamp = captured_ist.strftime("%Y%m%d_%H%M%S_%f")[:-1]
    label = evaluation.result.replace(" ", "_")
    image_name = f"{label}_{stamp}.jpg"
    out_path = _images_dir() / image_name
    # F-09: only record a capture whose image was written. On failure nothing is
    # inserted, counted or broadcast; a partial file from this attempt is kept and
    # reported, never deleted.
    reason = "cv2.imwrite returned False"
    try:
        written = cv2.imwrite(str(out_path), annotated)
    except Exception as exc:
        written, reason = False, f"{type(exc).__name__}: {exc}"
    if not written:
        _log_error(
            "capture image write failed for session %s (%s): %s; nothing was recorded%s",
            sid, image_name, reason, _partial_note(out_path),
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Could not save the capture image; nothing was recorded",
        )
    image_url = f"/api/captures/{image_name}"

    # Persist the capture row. Image bytes stay on disk; the DB stores
    # the relative path + result + ordering + timestamp for queries.
    try:
        with SessionLocal() as db:
            db.add(
                models.Capture(
                    session_id=sid,
                    operator_id=session.employee_id,
                    inspector_id=session.inspector_id,
                    result=evaluation.result,
                    detected_order=list(evaluation.detected_order),
                    expected_order=list(evaluation.expected_order),
                    image_path=image_name,
                )
            )
            db.commit()
    except Exception:
        # ponytail: the image is kept. A failed commit() looks the same as a commit
        # whose acknowledgement was lost (the row may exist), so deleting could strip
        # the image from a committed row. Orphan files are harmless; log them.
        _log_error(
            "capture row insert failed for session %s; image %s kept as a possible "
            "orphan (commit outcome unknown)",
            sid, image_name,
        )
        raise

    updated = sessions.record_capture(sid, evaluation.result, image_url)
    if updated is None:
        # Concurrent stop — surface as 409.
        raise HTTPException(status.HTTP_409_CONFLICT, "Session closed during analyze")

    await sessions.publish(sid, {
        "type": "counts",
        "ok_count": updated.ok_count,
        "not_ok_count": updated.not_ok_count,
        "last_result": evaluation.result,
        "last_image_url": image_url,
    })

    return AnalyzeResponse(
        result=evaluation.result,
        detected_order=evaluation.detected_order,
        expected_order=evaluation.expected_order,
        image_url=image_url,
        ok_count=updated.ok_count,
        not_ok_count=updated.not_ok_count,
        centroids=[c.as_dict() for c in evaluation.centroids],
    )
