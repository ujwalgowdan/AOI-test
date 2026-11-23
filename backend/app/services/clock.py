"""Wall-clock helpers pinned to Indian Standard Time.

The hardware sits in India, so every human-facing timestamp the app
generates (the time burned into a captured image, the JPEG filename
stamp, report header times) must be IST regardless of where the process
runs — in Docker the containers default to UTC, which made the captured
times read ~5h30m behind. Returning a *timezone-aware* datetime keeps
the value unambiguous when it's written to a `timestamptz` column.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def now_ist() -> datetime:
    """Current wall-clock time in IST (timezone-aware)."""
    return datetime.now(IST)
