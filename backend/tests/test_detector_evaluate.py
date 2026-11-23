"""Direct unit tests for `evaluate_frame` result classification.

These synthesise frames in code (numpy + cv2 rectangles) so they don't depend
on the empty JPEG-fixture directory. The legacy/parity test in
`test_detector_core.py` continues to cover round-trip behaviour once real
fixtures are recaptured.
"""

from __future__ import annotations

import numpy as np

from app.services import detector_core

# BGR colours that land squarely inside the COLOR_RANGES HSV bands.
# Green is desaturated slightly because the configured upper S bound is 254,
# so fully-saturated 255 falls just outside the mask.
YELLOW_BGR = (0, 255, 255)  # HSV (30, 255, 255) — inside yellow range
GREEN_BGR = (40, 200, 40)  # HSV ~(60, 204, 200) — inside green range

FRAME_W, FRAME_H = 640, 480


def _blank_frame() -> np.ndarray:
    # Dark grey background so it doesn't accidentally trigger the colour masks.
    frame = np.full((FRAME_H, FRAME_W, 3), 40, dtype=np.uint8)
    return frame


def _paint(frame: np.ndarray, bgr: tuple[int, int, int], cx: int, cy: int, size: int = 30) -> None:
    half = size // 2
    frame[cy - half: cy + half, cx - half: cx + half] = bgr


def _roi() -> tuple[int, int, int, int]:
    # Match the dashboard's source-coord ROI explicitly so we don't rely on
    # the default-fraction fallback computing the same numbers.
    return (FRAME_W // 3, int(FRAME_H * 3 / 8), FRAME_W // 3, FRAME_H // 4)


def test_ok_when_yellow_left_green_right() -> None:
    frame = _blank_frame()
    _paint(frame, YELLOW_BGR, cx=260, cy=270)
    _paint(frame, GREEN_BGR, cx=380, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "OK", result
    assert result.detected_order == ["yellow", "green"]


def test_not_ok_when_order_reversed() -> None:
    frame = _blank_frame()
    _paint(frame, GREEN_BGR, cx=260, cy=270)
    _paint(frame, YELLOW_BGR, cx=380, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT OK", result
    assert result.detected_order == ["green", "yellow"]


def test_not_detected_when_only_one_colour_detected() -> None:
    # Operator spec (2026-05-21, against NOT_OK_20260521_104753_*.jpg et al):
    # don't record a pass/fail judgement until BOTH expected colours are
    # visible. The live /api/detect/peek readiness badge gates the
    # Spacebar so this path is normally only hit on a misclick.
    frame = _blank_frame()
    _paint(frame, GREEN_BGR, cx=320, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT DETECTED", result
    assert result.detected_order == ["green"]


def test_not_detected_when_only_yellow_detected() -> None:
    frame = _blank_frame()
    _paint(frame, YELLOW_BGR, cx=320, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT DETECTED", result
    assert result.detected_order == ["yellow"]


def test_not_detected_when_no_colours_in_roi() -> None:
    frame = _blank_frame()
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT DETECTED", result
    assert result.detected_order == []


def test_not_detected_when_colours_outside_roi() -> None:
    # Wires sitting on the bench outside the alignment guide must not score.
    frame = _blank_frame()
    _paint(frame, YELLOW_BGR, cx=40, cy=40)
    _paint(frame, GREEN_BGR, cx=600, cy=440)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT DETECTED", result
    assert result.detected_order == []


# --- Vertical-layout cases ------------------------------------------------
#
# Operator's "left wire" maps to image-TOP when wires are presented
# stacked vertically in the current camera mounting (see the
# `EXPECTED_ORDER` doc comment in `detector_core`). The camera was
# rotated 180° between 2026-05-20 and 2026-05-22, so these tests are the
# inverse of their previous-mount versions and are pinned against
# `Screenshot 2026-05-22 094319.png` (yellow-top → OK) and
# `Screenshot 2026-05-22 094405.png` (green-top → NOT OK).


def test_ok_when_yellow_top_green_bottom() -> None:
    # Yellow above green at the same column → "yellow on operator-left"
    # in the current mount → OK.
    frame = _blank_frame()
    _paint(frame, YELLOW_BGR, cx=320, cy=200)
    _paint(frame, GREEN_BGR, cx=320, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "OK", result
    assert result.detected_order == ["yellow", "green"]


def test_not_ok_when_yellow_bottom_green_top() -> None:
    # Vertical layout with the colours swapped → operator sees yellow on
    # the right → NOT OK. This locks the camera-flip behaviour: a frame
    # that classified OK on the 2026-05-20 mount must now classify NOT OK.
    frame = _blank_frame()
    _paint(frame, GREEN_BGR, cx=320, cy=200)
    _paint(frame, YELLOW_BGR, cx=320, cy=270)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result == "NOT OK", result
    assert result.detected_order == ["green", "yellow"]


def test_not_ok_when_centroids_overlap() -> None:
    # Yellow donut wrapped around a green core — both colour masks pass
    # MIN_COLOR_AREA but their centroids land on the same pixel, so the
    # geometry-guard / sort-tiebreak collapses the ordering signal.
    # Either way the result must NOT be OK; the operator should
    # reposition rather than have noise pick the answer.
    frame = _blank_frame()
    _paint(frame, YELLOW_BGR, cx=320, cy=240, size=40)
    _paint(frame, GREEN_BGR, cx=320, cy=240, size=12)
    result = detector_core.evaluate_frame(frame, roi=_roi())
    assert result.result != "OK", result
    assert sorted(result.detected_order) == ["green", "yellow"]
