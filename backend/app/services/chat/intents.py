"""Chat step 1: the data-intent catalogue, its parameters and day handling.

The (future) LLM only picks an intent name and fills these params; every fact
in an answer comes from `tools.py` reading Postgres. Days are resolved here in
Python (Asia/Kolkata), never by the model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from app.services.clock import IST, now_ist

IntentName = Literal[
    "my_count_today",
    "explain_last_capture",
    "last_failed_capture",
    "session_counts",
    "not_ok_list",
    "top_failures_by_operator",
    "compare_days",
]


class NoParams(BaseModel):
    pass


class NotOkListParams(BaseModel):
    date: str = "today"
    limit: int = Field(20, ge=1, le=20)
    shift_requested: bool = False


class TopFailuresParams(BaseModel):
    date: str = "today"
    limit: int = Field(5, ge=1, le=10)


class CompareParams(BaseModel):
    day_a: str = "today"
    day_b: str = "yesterday"


PARAMS: dict[str, type[BaseModel]] = {
    "my_count_today": NoParams,
    "explain_last_capture": NoParams,
    "last_failed_capture": NoParams,
    "session_counts": NoParams,
    "not_ok_list": NotOkListParams,
    "top_failures_by_operator": TopFailuresParams,
    "compare_days": CompareParams,
}


@dataclass
class IntentResult:
    intent: str
    text: str
    columns: list[str]
    rows: list[list]
    source: str
    image_url: Optional[str] = None


_DMY = re.compile(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$")


def resolve_day(text: str, now: Optional[datetime] = None) -> date:
    """`today` / `yesterday` / `YYYY-MM-DD` / `DD-MM-YYYY` / `DD/MM/YYYY` -> IST date.
    Anything else raises ValueError: the bot asks again instead of guessing."""
    today = (now or now_ist()).astimezone(IST).date()
    t = text.strip().lower()
    if t == "today":
        return today
    if t == "yesterday":
        return today - timedelta(days=1)
    if m := _DMY.match(t):
        d, mth, y = map(int, m.groups())
        return date(y, mth, d)
    return date.fromisoformat(t)  # ValueError on anything else


def day_bounds(d: date) -> tuple[datetime, datetime]:
    """Same window as the Reports page: stationDayBounds sends `T00:00`..`T23:59`
    and the range endpoint filters `>= start AND <= end` (naive = IST).
    ponytail: a capture at 23:59:01-23:59:59 is outside, exactly as in Reports."""
    return datetime.combine(d, time(0, 0)), datetime.combine(d, time(23, 59))


def fmt_day(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def run(
    intent: str,
    params: Optional[dict] = None,
    *,
    session_id: Optional[str] = None,
    now: Optional[datetime] = None,
) -> IntentResult:
    from app.services.chat import tools  # local import: tools needs the DB engine

    if intent not in PARAMS:
        raise ValueError(f"unknown intent {intent!r}")
    try:
        p = PARAMS[intent](**(params or {}))
        return tools.HANDLERS[intent](p, session_id=session_id, now=now or now_ist())
    except (ValidationError, ValueError):
        return IntentResult(
            intent,
            "I couldn't understand that date or option. Try 'today', 'yesterday' or a date "
            "like 2026-11-20.",
            [], [], "",
        )
