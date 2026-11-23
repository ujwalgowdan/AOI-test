"""Parity test: feed each reference frame through the pure detector and
assert the result matches the filename label.

The fixtures directory ``fixtures/reference_frames/`` is currently empty.
The previous fixtures were captures from a rotated kiosk camera and no
longer match the detector axis (now left-to-right per
``detector_core.EXPECTED_ORDER``). Recapture by:

  1. Running the dashboard (``scripts/run-dev.ps1``).
  2. Holding a known-good or known-bad wire pair in the camera frame.
  3. Saving the JPEG returned by ``POST /api/sessions/{id}/analyze`` (its
     ``image_url`` is served by ``backend/app/routers/captures.py``).
  4. Dropping the file into this directory with the prefix ``OK_`` or
     ``NOT OK_`` so ``_ref_frames()`` picks it up.

With no fixtures present, pytest collects zero parametrized cases and the
test passes trivially — exactly the behavior we want until real fixtures
are recaptured.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from app.services import detector_core

REF_DIR = Path(__file__).resolve().parent / "fixtures" / "reference_frames"


def _ref_frames() -> list[tuple[Path, str]]:
    frames: list[tuple[Path, str]] = []
    if not REF_DIR.exists():
        return frames
    for p in sorted(REF_DIR.iterdir()):
        if p.suffix.lower() not in {".jpg", ".jpeg"}:
            continue
        name = p.stem
        if name.startswith("NOT OK_"):
            frames.append((p, "NOT OK"))
        elif name.startswith("OK_"):
            frames.append((p, "OK"))
    return frames


@pytest.mark.parametrize("path,expected", _ref_frames())
def test_reference_frames(path: Path, expected: str) -> None:
    img = cv2.imread(str(path))
    assert img is not None, f"Could not read {path}"
    result = detector_core.evaluate_frame(img)
    assert result.result == expected, (
        f"{path.name}: expected {expected}, got {result.result} "
        f"detected={result.detected_order}"
    )
