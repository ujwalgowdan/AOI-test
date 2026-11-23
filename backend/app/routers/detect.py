"""Lightweight readiness probe.

The dashboard polls this while waiting for the operator to press Space.
It runs the SAME colour-mask code that `/api/sessions/{sid}/analyze`
uses, but doesn't require an active session, doesn't write any files,
doesn't bump counts, and doesn't broadcast on the WebSocket. The
response just tells the UI which expected colours are visible right now
so the camera card can show a READY / NOT DETECTED badge before the
operator commits to a capture.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Form, HTTPException, UploadFile, status

from app.schemas import PeekResponse
from app.services import detector_core

router = APIRouter(prefix="/api/detect", tags=["detect"])


@router.post("/peek", response_model=PeekResponse)
async def peek(
    frame: UploadFile,
    roi_x: Optional[int] = Form(None),
    roi_y: Optional[int] = Form(None),
    roi_w: Optional[int] = Form(None),
    roi_h: Optional[int] = Form(None),
) -> PeekResponse:
    payload = await frame.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty frame upload")

    img = detector_core.decode_jpeg(payload)
    if img is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not decode JPEG")

    roi = None
    if None not in (roi_x, roi_y, roi_w, roi_h):
        roi = (roi_x, roi_y, roi_w, roi_h)

    h, w = img.shape[:2]
    clamped = detector_core._clamp_roi(roi, w, h) if roi is not None else detector_core.default_centered_roi(w, h)
    names, _ = detector_core.detect_colors_in_roi(img, clamped)

    expected = list(detector_core.EXPECTED_ORDER)
    ready = sorted(names) == sorted(expected)
    return PeekResponse(ready=ready, detected=names, expected=expected)
