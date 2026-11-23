"""Chat step 1: the 7 data intents. Read-only Postgres queries -> IntentResult.

Every number in an answer sentence comes from the same rows as its facts table.
Each query runs in a `SET TRANSACTION READ ONLY` transaction that is rolled back.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime
from typing import Callable, Iterator, Optional

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DbSession

from app.db.engine import SessionLocal
from app.db.models import Capture, Operator
from app.services.chat.intents import (
    CompareParams,
    IntentResult,
    NotOkListParams,
    TopFailuresParams,
    day_bounds,
    fmt_day,
    resolve_day,
)
from app.services.session_manager import Session, sessions

RESULTS = ("OK", "NOT OK", "NOT DETECTED")
FAILED = ("NOT OK", "NOT DETECTED")
NO_SESSION = "Start a session first so I know who you are."


@contextmanager
def _readonly() -> Iterator[DbSession]:
    with SessionLocal() as db:
        db.execute(text("SET TRANSACTION READ ONLY"))
        try:
            yield db
        finally:
            db.expunge_all()  # keep loaded rows usable: rollback would expire them
            db.rollback()


def _active(session_id: Optional[str]) -> Optional[Session]:
    s = sessions.get(session_id) if session_id else None
    return s if s and s.end_time is None else None


def _result_counts(db: DbSession, *where) -> dict[str, int]:
    rows = db.execute(select(Capture.result, func.count()).where(*where).group_by(Capture.result))
    counts = dict.fromkeys(RESULTS, 0)
    counts.update({r: n for r, n in rows})
    return counts


def _in_day(d: date):
    start, end = day_bounds(d)
    return Capture.captured_at >= start, Capture.captured_at <= end


def _day_source(d: date) -> str:
    return f"captures · {fmt_day(d)} 00:00–23:59 IST"


def _order(colours: list[str]) -> str:
    return " → ".join(colours) if colours else "none"


def _hms(c: Capture) -> str:
    return c.captured_at.strftime("%H:%M:%S")


def _counts_table(counts: dict[str, int]) -> list[list]:
    return [[r, counts[r]] for r in RESULTS]


def _scope(session_id: Optional[str]) -> tuple[list, str]:
    """Live session -> that session's captures; otherwise the whole station."""
    s = _active(session_id)
    if s:
        return [Capture.session_id == s.id], f"captures · session {s.id[:8]}"
    return [], "captures · all sessions"


# ---- intents ---------------------------------------------------------------

def my_count_today(_p, *, session_id: Optional[str], now: datetime) -> IntentResult:
    s = _active(session_id)
    if not s:
        return IntentResult("my_count_today", NO_SESSION, [], [], "")
    d = resolve_day("today", now)
    with _readonly() as db:
        c = _result_counts(db, Capture.operator_id == s.employee_id, *_in_day(d))
    total = sum(c.values())
    return IntentResult(
        "my_count_today",
        f"You ({s.employee_name}, {s.employee_id}) have tested {total} cables today: "
        f"{c['OK']} OK, {c['NOT OK']} NOT OK, {c['NOT DETECTED']} NOT DETECTED.",
        ["Result", "Count"], _counts_table(c),
        f"captures · operator {s.employee_id} · {fmt_day(d)} 00:00–23:59 IST",
    )


def _explain(c: Capture) -> str:
    head = f"The last capture ({_hms(c)}, {c.operator_id})"
    det, exp = list(c.detected_order), list(c.expected_order)
    if c.result == "OK":
        return f"{head} passed: the wires read {_order(det)}, as expected."
    if c.result == "NOT DETECTED":
        return (f"{head} was NOT DETECTED: only {len(det)} of {len(exp)} wire colours were "
                f"found inside the guide box (seen: {', '.join(det) or 'none'}). "
                "Place both wires fully inside the box and capture again.")
    if det == exp:  # detector_core: same order but centroids nearly overlapping
        return (f"{head} was NOT OK: the two wires were too close together to tell their "
                "order. Separate them and capture again.")
    return (f"{head} was NOT OK: the wires read {_order(det)} (operator left → right), "
            f"expected {_order(exp)}.")


def _capture_row(c: Capture) -> list:
    return [_hms(c), c.operator_id, c.result, _order(list(c.detected_order)),
            _order(list(c.expected_order))]


_CAPTURE_COLS = ["Time", "Operator", "Result", "Detected", "Expected"]


def explain_last_capture(_p, *, session_id: Optional[str], now: datetime) -> IntentResult:
    where, source = _scope(session_id)
    with _readonly() as db:
        c = db.scalars(select(Capture).where(*where)
                       .order_by(Capture.captured_at.desc(), Capture.id.desc()).limit(1)).first()
    if not c:
        return IntentResult("explain_last_capture", "No captures recorded yet.", [], [], source)
    return IntentResult("explain_last_capture", _explain(c), _CAPTURE_COLS, [_capture_row(c)], source)


def last_failed_capture(_p, *, session_id: Optional[str], now: datetime) -> IntentResult:
    where, source = _scope(session_id)
    with _readonly() as db:
        c = db.scalars(select(Capture).where(*where, Capture.result.in_(FAILED))
                       .order_by(Capture.captured_at.desc(), Capture.id.desc()).limit(1)).first()
    if not c:
        return IntentResult("last_failed_capture", "No failed captures recorded.", [], [], source)
    return IntentResult(
        "last_failed_capture",
        f"The last failed capture was {c.result} at {_hms(c)} on {fmt_day(c.captured_at.date())} "
        f"by {c.operator_id}.",
        _CAPTURE_COLS, [_capture_row(c)], source,
        image_url=f"/api/captures/{c.image_path}" if c.image_path else None,
    )


def session_counts(_p, *, session_id: Optional[str], now: datetime) -> IntentResult:
    s = _active(session_id)
    if not s:
        return IntentResult("session_counts", "There is no active session. " + NO_SESSION,
                            [], [], "")
    with _readonly() as db:
        c = _result_counts(db, Capture.session_id == s.id)
    return IntentResult(
        "session_counts",
        f"This session: {c['OK']} OK, {c['NOT OK']} NOT OK (and {c['NOT DETECTED']} NOT "
        "DETECTED, which the dashboard badge doesn't count).",
        ["Result", "Count"], _counts_table(c), f"captures · session {s.id[:8]}",
    )


def not_ok_list(p: NotOkListParams, *, session_id: Optional[str], now: datetime) -> IntentResult:
    d = resolve_day(p.date, now)
    where = (Capture.result == "NOT OK", *_in_day(d))
    with _readonly() as db:
        total = db.scalar(select(func.count()).select_from(Capture).where(*where)) or 0
        rows = db.scalars(select(Capture).where(*where)
                          .order_by(Capture.captured_at.desc(), Capture.id.desc())
                          .limit(p.limit)).all()
    note = "Shift isn't recorded, so this shows the whole day (IST). " if p.shift_requested else ""
    shown = f" Showing the latest {len(rows)}." if total > len(rows) else ""
    return IntentResult(
        "not_ok_list",
        f"{note}There were {total} NOT OK captures on {fmt_day(d)}.{shown}",
        ["Time", "Operator", "Detected", "Expected"],
        [[_hms(c), c.operator_id, _order(list(c.detected_order)), _order(list(c.expected_order))]
         for c in rows],
        _day_source(d),
    )


def top_failures_by_operator(p: TopFailuresParams, *, session_id: Optional[str],
                             now: datetime) -> IntentResult:
    d = resolve_day(p.date, now)
    nok = func.count().filter(Capture.result == "NOT OK")
    nd = func.count().filter(Capture.result == "NOT DETECTED")
    failures = (nok + nd).label("failures")
    q = (select(Capture.operator_id, Operator.name, nok, nd, failures, func.count())
         .join(Operator, Operator.id == Capture.operator_id)
         .where(*_in_day(d))
         .group_by(Capture.operator_id, Operator.name)
         .having(nok + nd > 0)
         .order_by(failures.desc(), Capture.operator_id)
         .limit(p.limit))
    with _readonly() as db:
        rows = [list(r) for r in db.execute(q)]
    if not rows:
        return IntentResult("top_failures_by_operator", f"No failures on {fmt_day(d)}.",
                            [], [], _day_source(d))
    top = rows[0][4]
    leaders = [f"{r[0]} ({r[1]})" for r in rows if r[4] == top]
    tie = " (tied)" if len(leaders) > 1 else ""
    return IntentResult(
        "top_failures_by_operator",
        f"Most failures on {fmt_day(d)}: {' and '.join(leaders)} with {top}{tie}.",
        ["Operator", "Name", "NOT OK", "NOT DETECTED", "Failures", "Total"], rows,
        _day_source(d),
    )


def compare_days(p: CompareParams, *, session_id: Optional[str], now: datetime) -> IntentResult:
    a, b = resolve_day(p.day_a, now), resolve_day(p.day_b, now)
    with _readonly() as db:
        ca, cb = _result_counts(db, *_in_day(a)), _result_counts(db, *_in_day(b))
    ta, tb = sum(ca.values()), sum(cb.values())
    diff = ta - tb
    pct = f"{diff / tb * 100:+.0f}%" if tb else "n/a"
    return IntentResult(
        "compare_days",
        f"{fmt_day(a)}: {ta} captures vs {fmt_day(b)}: {tb} ({diff:+d}, {pct}).",
        ["Day", "Total", "OK", "NOT OK", "NOT DETECTED"],
        [[fmt_day(x), sum(c.values()), c["OK"], c["NOT OK"], c["NOT DETECTED"]]
         for x, c in ((a, ca), (b, cb))],
        f"captures · {fmt_day(a)} vs {fmt_day(b)} (IST, 00:00–23:59)",
    )


HANDLERS: dict[str, Callable[..., IntentResult]] = {
    "my_count_today": my_count_today,
    "explain_last_capture": explain_last_capture,
    "last_failed_capture": last_failed_capture,
    "session_counts": session_counts,
    "not_ok_list": not_ok_list,
    "top_failures_by_operator": top_failures_by_operator,
    "compare_days": compare_days,
}
