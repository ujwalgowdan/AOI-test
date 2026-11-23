"""Pure-function detection logic lifted out of `legacy/detector.py`.

The legacy `ConnectorDetector` mixed three concerns: camera I/O, an OpenCV
preview window with a keyboard loop, and the actual color-order evaluation.
Only the third belongs in a stateless backend service. HSV ranges carry
over from the legacy detector. The comparison axis is picked per-frame
from the centroid spread (see `detect_colors_in_roi`): horizontal layouts
sort by x-centroid (image-left == operator-left); vertical layouts sort
by y-centroid ascending (image-top == operator-left, matching the
current camera mount which was rotated 180° from the 2026-05-20 mount).
EXPECTED_ORDER stays operator-relative "yellow-left, green-right" in
both orientations.

Detection is constrained to a centered ROI that mirrors the cyan / blue
alignment guide drawn in `frontend/src/components/CameraView.tsx`
(`left-1/3 top-[37.5%] w-1/3 h-1/4`). The frontend computes the box in
source-video coordinates (after compensating for the `<video>` element's
`object-cover` cropping) and ships it on the multipart upload, so the
analyzed region matches what the operator saw pixel-for-pixel. Wires
outside the box are ignored. If a caller omits the ROI we fall back to the
same proportional centered rectangle (`DEFAULT_ROI_FRAC`) so legacy
clients still get strict clipping, never a whole-frame scan.
`annotate_frame` draws the active ROI in green on the saved JPEG so the
persisted capture matches what the operator saw.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Tuple

import cv2
import numpy as np

# Tuned via the legacy `calibrate_colors.py` against good_*/bad_*.jpg
# references. S/V floors are kept low so that wires detected under dim
# indoor light, webcam auto-exposure, and hand shadows are not missed.
# CLAHE normalisation in `_equalize_roi` handles the brightness axis, so
# the V floor only needs to reject near-black pixels. The hue bands are
# kept tight enough that they don't overlap with each other or with skin.
COLOR_RANGES: dict[str, tuple[tuple[int, int, int], tuple[int, int, int]]] = {
    "green":  ((35, 50, 40), (90, 255, 255)),
    "yellow": ((15, 50, 40), (38, 255, 255)),
}

# Operator-frame, read left-to-right ("left wire" first). The detector picks
# the sort axis automatically (see detect_colors_in_roi) so this constant
# stays orientation-agnostic: whether the wires are arranged horizontally or
# stacked vertically in the camera frame, "yellow-left / green-right" still
# means yellow first.
#
# Mapping in the current camera mounting (verified against
# `Screenshot 2026-05-22 094319.png` + `Screenshot 2026-05-22 094405.png`,
# operator-confirmed spec "good wiring = left:yellow, right:green"):
#   - horizontal wire pair:  operator-left  = image-left   (sort by x ascending)
#   - vertical wire pair:    operator-left  = image-top    (sort by y ascending)
# The camera was rotated 180° between 2026-05-20 and 2026-05-22 (the
# previous mounting had image-bottom = operator-left); now image-top maps
# to operator-left, same as the legacy rotated kiosk. If the mount flips
# again, only the lambda in `detect_colors_in_roi` for the vertical
# branch needs to change sign.
EXPECTED_ORDER: list[str] = ["yellow", "green"]

DARK_THRESH = 60
MIN_CONNECTOR_AREA = 4000
CONNECTOR_EXPAND = 12
# Lowered from 60 → 30: centroid is now computed over the full mask (not
# just the largest contour) so a wire that appears as several fragments
# under uneven lighting still clears the threshold as long as the combined
# mask covers at least 30 pixels.
MIN_COLOR_AREA = 30

# Geometry guard for the left/right classification. If the two color
# centroids are stacked nearly on top of each other along BOTH axes the
# ordering is dominated by sub-pixel noise and the OK / NOT OK call is
# unreliable. In that case we return NOT OK so the operator repositions
# (NOT DETECTED is reserved for the no-cable case).
#
# Used as a floor on max(|dx|, |dy|) — see `evaluate_frame`. Previously
# this only fired on perfect overlap (dx == dy == 0), which let near-
# overlapping blobs slip through with random results.
# `archive/legacy-streamlit/OK_20260515_170052_26477.jpg` is the reference
# capture that motivated the guard.
MIN_CENTROID_SEPARATION_PX = 4

# Fallback ROI as a fraction of the source frame. Mirrors the cyan / blue
# alignment guide in `CameraView.tsx` (`left-1/3 top-[37.5%] w-1/3 h-1/4`).
# Used only when the caller doesn't ship an explicit ROI — the dashboard
# always does, so this is a guardrail for direct/legacy callers.
DEFAULT_ROI_FRAC: tuple[float, float, float, float] = (1 / 3, 3 / 8, 1 / 3, 1 / 4)


def default_centered_roi(width: int, height: int) -> Tuple[int, int, int, int]:
    fx, fy, fw, fh = DEFAULT_ROI_FRAC
    return (
        int(round(width * fx)),
        int(round(height * fy)),
        int(round(width * fw)),
        int(round(height * fh)),
    )


def _clamp_roi(
    roi: Tuple[int, int, int, int], width: int, height: int
) -> Tuple[int, int, int, int]:
    """Clamp `roi` to the frame so a malformed/stale rect can't index out of bounds."""
    x, y, w, h = roi
    x = max(0, min(int(x), width - 1))
    y = max(0, min(int(y), height - 1))
    w = max(1, min(int(w), width - x))
    h = max(1, min(int(h), height - y))
    return (x, y, w, h)


@dataclass(slots=True)
class Centroid:
    color: str
    x: int  # image coordinates, already offset by the ROI origin
    y: int

    def as_dict(self) -> dict[str, int | str]:
        return {"color": self.color, "x": self.x, "y": self.y}


@dataclass(slots=True)
class EvalResult:
    result: str  # "OK" | "NOT OK" | "NOT DETECTED"
    detected_order: list[str]
    expected_order: list[str]
    roi: Optional[Tuple[int, int, int, int]]  # x, y, w, h
    centroids: list[Centroid] = field(default_factory=list)


def auto_detect_connector(frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, DARK_THRESH, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    clean = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < MIN_CONNECTOR_AREA:
            continue
        x, y, ww, hh = cv2.boundingRect(cnt)
        candidates.append((area, x, y, ww, hh))

    if not candidates:
        return None

    candidates.sort(reverse=True, key=lambda t: t[0])
    _, x, y, ww, hh = candidates[0]

    x1 = max(0, x - CONNECTOR_EXPAND)
    y1 = max(0, y - CONNECTOR_EXPAND)
    x2 = min(w, x + ww + CONNECTOR_EXPAND)
    y2 = min(h, y + hh + CONNECTOR_EXPAND)
    return (x1, y1, x2 - x1, y2 - y1)


def _equalize_roi(roi_img: np.ndarray) -> np.ndarray:
    """Return HSV image with CLAHE applied to the V channel.

    Normalises brightness so the same HSV thresholds work under dim indoor
    light, fluorescent, overexposed webcam auto-exposure, and hand shadows.
    Only V is touched; H and S (colour identity) are preserved exactly.
    """
    hsv = cv2.cvtColor(roi_img, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    return cv2.merge([h, s, clahe.apply(v)])


def detect_colors_in_roi(
    frame: np.ndarray, roi: Tuple[int, int, int, int]
) -> tuple[list[str], list[Centroid]]:
    """Return (ordered color names, centroids in image coordinates).

    Ordering is operator-relative left-to-right ("left wire" first). The
    sort axis is picked per-frame from the centroid spread so the same
    rule works whether the operator presents the wires side-by-side or
    stacked vertically:

      * |dx| >= |dy| → wires are horizontal in the image. Sort by image-x
        ascending; image-left maps to operator-left.
      * |dy| >  |dx| → wires are stacked vertically. Sort by image-y
        descending; image-bottom maps to operator-left in the current
        camera mounting (see `EXPECTED_ORDER` doc comment).

    With fewer than two centroids the spread test is moot; the single
    detection (or empty list) is returned as-is and `evaluate_frame`
    handles the missing-colour case.
    """
    x, y, rw, rh = roi
    roi_img = frame[y:y + rh, x:x + rw]
    hsv = _equalize_roi(roi_img)

    raw: list[tuple[str, int, int]] = []  # (name, img_x, img_y)
    kernel = np.ones((3, 3), np.uint8)

    for name, (lower, upper) in COLOR_RANGES.items():
        mask = cv2.inRange(hsv, np.array(lower, dtype=np.uint8), np.array(upper, dtype=np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

        # Use the full mask for area + centroid so a wire that appears as
        # several small fragments under uneven lighting still registers.
        total_area = cv2.countNonZero(mask)
        if total_area < MIN_COLOR_AREA:
            continue

        M = cv2.moments(mask)
        if M["m00"] == 0:
            continue
        # x/y are ROI-local; offset by the ROI origin to get image coordinates.
        cx_roi = int(M["m10"] / M["m00"])
        cy_roi = int(M["m01"] / M["m00"])
        raw.append((name, x + cx_roi, y + cy_roi))

    if len(raw) >= 2:
        dx = abs(raw[0][1] - raw[-1][1])
        dy = abs(raw[0][2] - raw[-1][2])
        if dx >= dy:
            # Horizontal: image-left first == operator-left first.
            raw.sort(key=lambda t: t[1])
        else:
            # Vertical: image-top first == operator-left first (camera
            # rotated 180° vs. the 2026-05-20 mounting, see EXPECTED_ORDER).
            raw.sort(key=lambda t: t[2])

    names = [t[0] for t in raw]
    centroids = [Centroid(color=t[0], x=t[1], y=t[2]) for t in raw]
    return names, centroids


def evaluate_frame(frame: np.ndarray, roi: Optional[Tuple[int, int, int, int]] = None) -> EvalResult:
    h, w = frame.shape[:2]
    # Strict clip: detection must never reach outside the operator's
    # alignment guide, otherwise wires sitting on the bench behind the
    # connector get scored. The frontend ships the box; if it's missing we
    # fall back to the same proportional rectangle instead of the whole
    # frame.
    roi = _clamp_roi(roi, w, h) if roi is not None else default_centered_roi(w, h)

    names, centroids = detect_colors_in_roi(frame, roi)

    # NOT DETECTED covers both "no cable" and "one wire missing/discoloured"
    # — the legacy spec the user re-confirmed against
    # `NOT_OK_20260521_104753_34755.jpg` etc.: we must not record a pass/fail
    # judgement until BOTH expected colours are visible. The live readiness
    # badge (driven by /api/detect/peek) gates the operator's Spacebar so
    # this path is normally only hit on a misclick or a wire that vanishes
    # between probe and capture.
    if len(names) < len(EXPECTED_ORDER):
        return EvalResult("NOT DETECTED", names, list(EXPECTED_ORDER), roi, centroids)

    if names == EXPECTED_ORDER:
        # Near-overlapping blobs (e.g. both masks landing on the same wire
        # because of overlapping HSV ranges): the ordering rule has no
        # signal to work with. Treat as NOT OK so the operator repositions
        # rather than counting it as a pass.
        if len(centroids) >= 2:
            dx = abs(centroids[0].x - centroids[-1].x)
            dy = abs(centroids[0].y - centroids[-1].y)
            if max(dx, dy) < MIN_CENTROID_SEPARATION_PX:
                return EvalResult("NOT OK", names, list(EXPECTED_ORDER), roi, centroids)
        return EvalResult("OK", names, list(EXPECTED_ORDER), roi, centroids)

    return EvalResult("NOT OK", names, list(EXPECTED_ORDER), roi, centroids)


def annotate_frame(
    frame: np.ndarray,
    evaluation: EvalResult,
    *,
    daily_count: int = 0,
    timestamp: Optional[str] = None,
) -> np.ndarray:
    """Return a copy of `frame` with legacy-style overlays drawn.

    Visual style mirrors `archive/legacy-streamlit/detector.py:_save_detection_image`
    so the served JPEGs and the legacy reference frames look the same.
    """
    out = frame.copy()
    h = out.shape[0]

    # Green ROI rectangle.
    if evaluation.roi is not None:
        rx, ry, rw, rh = evaluation.roi
        cv2.rectangle(out, (rx, ry), (rx + rw, ry + rh), (0, 255, 0), 2)

    # White dot + color label at each centroid.
    for c in evaluation.centroids:
        cv2.circle(out, (c.x, c.y), 4, (255, 255, 255), -1)
        cv2.putText(
            out, c.color, (c.x + 6, c.y - 6),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1,
        )

    # Result text top-left. Green / red / orange depending on outcome.
    if evaluation.result == "OK":
        result_color = (0, 255, 0)
    elif evaluation.result == "NOT OK":
        result_color = (0, 0, 255)
    else:  # NOT DETECTED
        result_color = (0, 165, 255)
    cv2.putText(
        out, f"Result: {evaluation.result}", (10, 50),
        cv2.FONT_HERSHEY_SIMPLEX, 1.2, result_color, 3,
    )

    # Daily count just below the result.
    cv2.putText(
        out, f"Daily Count: {daily_count}", (10, 100),
        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2,
    )

    # Timestamp bottom-left.
    ts = timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(
        out, ts, (10, h - 20),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2,
    )

    return out


def decode_jpeg(payload: bytes) -> Optional[np.ndarray]:
    arr = np.frombuffer(payload, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img if img is not None and img.size else None
