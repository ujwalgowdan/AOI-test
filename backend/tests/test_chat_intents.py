"""Chat step 1: the 7 data intents give exact numbers on synthetic data.

Needs Postgres (skips otherwise). "Today" is pinned to 2031-06-10 IST by passing
`now`; yesterday is 2031-06-09. Live sessions are registered in the in-memory
SessionManager and their ids are used for the seeded captures.

Day 2031-06-10 (IST), inside 00:00-23:59:
  op A (session S1): 09:00-09:02 OK x3, 09:03 NOT OK (green,yellow),
                     09:04 NOT DETECTED (yellow), 09:05 NOT OK near-overlap (yellow,green)
  op B (session S2): 10:00 OK, 10:01 ND (), 10:02 ND (green), 23:59:00 NOT OK
  outside the window: S2 23:59:30 NOT OK (with image) -> excluded, as in Reports
Day 2031-06-09: op A 3 OK + 1 NOT OK (no live session).
2031-06-20: one capture each in sessions S_WRONG / S_ND / S_OK (explanation texts).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import delete, insert, select

try:
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.services.chat import tools
    from app.services.chat.intents import day_bounds, resolve_day, run
    from app.services.clock import IST
    from app.services.session_manager import sessions
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)

NOW = datetime(2031, 6, 10, 15, 0, tzinfo=IST)
Y, G = "yellow", "green"


@pytest.fixture(scope="module")
def seed():
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Operator).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")
    tag = uuid.uuid4().hex[:8]
    A, B, INS = f"OP_CHAT_{tag}_A", f"OP_CHAT_{tag}_B", f"IN_CHAT_{tag}"
    ins = {"id": INS, "name": "Chat Insp"}
    mk = lambda op, name: sessions.create({"id": op, "name": name}, ins)  # noqa: E731
    s1, s2 = mk(A, "Asha A"), mk(B, "Bala B")
    s_wrong, s_nd, s_ok, s_empty = mk(A, "Asha A"), mk(A, "Asha A"), mk(A, "Asha A"), mk(A, "Asha A")
    s_ended = mk(A, "Asha A")
    sessions.close(s_ended.id)
    s0 = f"sess_chat_{tag}_y"

    def cap(sid, op, result, det, at, image=None):
        return models.Capture(session_id=sid, operator_id=op, inspector_id=INS, result=result,
                              detected_order=det, expected_order=[Y, G], image_path=image,
                              captured_at=at)

    d = lambda h, m, s=0: datetime(2031, 6, 10, h, m, s, tzinfo=IST)  # noqa: E731
    rows = [
        cap(s1.id, A, "OK", [Y, G], d(9, 0)), cap(s1.id, A, "OK", [Y, G], d(9, 1)),
        cap(s1.id, A, "OK", [Y, G], d(9, 2)), cap(s1.id, A, "NOT OK", [G, Y], d(9, 3)),
        cap(s1.id, A, "NOT DETECTED", [Y], d(9, 4)), cap(s1.id, A, "NOT OK", [Y, G], d(9, 5)),
        cap(s2.id, B, "OK", [Y, G], d(10, 0)), cap(s2.id, B, "NOT DETECTED", [], d(10, 1)),
        cap(s2.id, B, "NOT DETECTED", [G], d(10, 2)), cap(s2.id, B, "NOT OK", [G, Y], d(23, 59)),
        cap(s2.id, B, "NOT OK", [G, Y], d(23, 59, 30), image="NOT_OK_chat_test.jpg"),
        *[cap(s0, A, "OK", [Y, G], datetime(2031, 6, 9, 11, i, tzinfo=IST)) for i in range(3)],
        cap(s0, A, "NOT OK", [G, Y], datetime(2031, 6, 9, 11, 5, tzinfo=IST)),
        cap(s_wrong.id, A, "NOT OK", [G, Y], datetime(2031, 6, 20, 8, 0, tzinfo=IST)),
        cap(s_nd.id, A, "NOT DETECTED", [Y], datetime(2031, 6, 20, 8, 1, tzinfo=IST)),
        cap(s_ok.id, A, "OK", [Y, G], datetime(2031, 6, 20, 8, 2, tzinfo=IST)),
    ]
    with SessionLocal() as db:
        db.add_all([models.Operator(id=A, name="Asha A"), models.Operator(id=B, name="Bala B"),
                    models.Inspector(id=INS, name="Chat Insp")])
        db.flush()
        db.add_all(rows)
        db.commit()
    sids = [s.id for s in (s1, s2, s_wrong, s_nd, s_ok, s_empty, s_ended)] + [s0]
    yield dict(A=A, B=B, s1=s1.id, s2=s2.id, wrong=s_wrong.id, nd=s_nd.id, ok=s_ok.id,
               empty=s_empty.id, ended=s_ended.id)
    with SessionLocal() as db:
        db.execute(delete(models.Capture).where(models.Capture.session_id.in_(sids)))
        db.execute(delete(models.Inspector).where(models.Inspector.id == INS))
        db.execute(delete(models.Operator).where(models.Operator.id.in_([A, B])))
        db.commit()
    for sid in sids[:-1]:
        sessions.close(sid)


# ---- dates (no DB) ----------------------------------------------------------

def test_resolve_day_formats_and_rejects_garbage():
    assert resolve_day("today", NOW) == date(2031, 6, 10)
    assert resolve_day(" Yesterday ", NOW) == date(2031, 6, 9)
    assert resolve_day("2031-05-04", NOW) == date(2031, 5, 4)
    assert resolve_day("04-05-2031", NOW) == date(2031, 5, 4)
    assert resolve_day("4/5/2031", NOW) == date(2031, 5, 4)
    for bad in ("last tuesday", "31-02-2031", "", "2031/13/01"):
        with pytest.raises(ValueError):
            resolve_day(bad, NOW)


def test_day_bounds_match_stationDayBounds():
    assert day_bounds(date(2031, 6, 10)) == (datetime(2031, 6, 10, 0, 0), datetime(2031, 6, 10, 23, 59))


def test_today_rolls_over_at_ist_midnight():
    assert resolve_day("today", datetime(2031, 6, 9, 18, 29, tzinfo=timezone.utc)) == date(2031, 6, 9)
    assert resolve_day("today", datetime(2031, 6, 9, 18, 31, tzinfo=timezone.utc)) == date(2031, 6, 10)


# ---- intents ------------------------------------------------------------------

def test_my_count_today(seed):
    r = run("my_count_today", session_id=seed["s1"], now=NOW)
    assert r.text == (f"You (Asha A, {seed['A']}) have tested 6 cables today: "
                      "3 OK, 2 NOT OK, 1 NOT DETECTED.")
    assert r.rows == [["OK", 3], ["NOT OK", 2], ["NOT DETECTED", 1]]
    assert r.source == f"captures · operator {seed['A']} · 10 Jun 2031 00:00–23:59 IST"


@pytest.mark.parametrize("sid", [None, "no-such-session", "ended"])
def test_my_count_today_without_active_session(seed, sid):
    r = run("my_count_today", session_id=seed.get(sid, sid), now=NOW)
    assert r.text == "Start a session first so I know who you are."
    assert r.rows == [] and r.columns == []


def test_explain_last_capture_near_overlap(seed):
    r = run("explain_last_capture", session_id=seed["s1"], now=NOW)
    assert r.text == (f"The last capture (09:05:00, {seed['A']}) was NOT OK: the two wires were "
                      "too close together to tell their order. Separate them and capture again.")
    assert r.rows == [["09:05:00", seed["A"], "NOT OK", "yellow → green", "yellow → green"]]


def test_explain_last_capture_wrong_order_nd_ok(seed):
    a = seed["A"]
    assert run("explain_last_capture", session_id=seed["wrong"], now=NOW).text == (
        f"The last capture (08:00:00, {a}) was NOT OK: the wires read green → yellow "
        "(operator left → right), expected yellow → green.")
    assert run("explain_last_capture", session_id=seed["nd"], now=NOW).text == (
        f"The last capture (08:01:00, {a}) was NOT DETECTED: only 1 of 2 wire colours were "
        "found inside the guide box (seen: yellow). Place both wires fully inside the box "
        "and capture again.")
    assert run("explain_last_capture", session_id=seed["ok"], now=NOW).text == (
        f"The last capture (08:02:00, {a}) passed: the wires read yellow → green, as expected.")


def test_explain_last_capture_empty_session_and_station_scope(seed):
    r = run("explain_last_capture", session_id=seed["empty"], now=NOW)
    assert r.text == "No captures recorded yet." and r.rows == []
    r = run("explain_last_capture", now=NOW)  # no session -> latest capture station-wide
    with SessionLocal() as db:
        latest = db.scalars(select(models.Capture).order_by(
            models.Capture.captured_at.desc(), models.Capture.id.desc()).limit(1)).one()
    assert r.source == "captures · all sessions"
    assert r.rows[0][:3] == [latest.captured_at.strftime("%H:%M:%S"), latest.operator_id, latest.result]


def test_last_failed_capture(seed):
    r = run("last_failed_capture", session_id=seed["s2"], now=NOW)
    assert r.text == f"The last failed capture was NOT OK at 23:59:30 on 10 Jun 2031 by {seed['B']}."
    assert r.image_url == "/api/captures/NOT_OK_chat_test.jpg"
    r = run("last_failed_capture", session_id=seed["s1"], now=NOW)
    assert r.rows[0][0] == "09:05:00" and r.image_url is None
    r = run("last_failed_capture", session_id=seed["ok"], now=NOW)
    assert r.text == "No failed captures recorded." and r.rows == []


def test_session_counts(seed):
    r = run("session_counts", session_id=seed["s1"], now=NOW)
    assert r.text == ("This session: 3 OK, 2 NOT OK (and 1 NOT DETECTED, which the dashboard "
                      "badge doesn't count).")
    assert r.rows == [["OK", 3], ["NOT OK", 2], ["NOT DETECTED", 1]]
    assert r.source == f"captures · session {seed['s1'][:8]}"
    r = run("session_counts", session_id=seed["ended"], now=NOW)
    assert r.text == "There is no active session. Start a session first so I know who you are."


def test_not_ok_list(seed):
    a, b = seed["A"], seed["B"]
    r = run("not_ok_list", {"date": "today"}, now=NOW)
    assert r.text == "There were 3 NOT OK captures on 10 Jun 2031."
    assert r.rows == [["23:59:00", b, "green → yellow", "yellow → green"],
                      ["09:05:00", a, "yellow → green", "yellow → green"],
                      ["09:03:00", a, "green → yellow", "yellow → green"]]
    assert r.source == "captures · 10 Jun 2031 00:00–23:59 IST"
    r = run("not_ok_list", {"limit": 2}, now=NOW)
    assert r.text == "There were 3 NOT OK captures on 10 Jun 2031. Showing the latest 2."
    assert len(r.rows) == 2


def test_not_ok_list_shift_not_recorded(seed):
    r = run("not_ok_list", {"shift_requested": True}, now=NOW)
    assert r.text == ("Shift isn't recorded, so this shows the whole day (IST). "
                      "There were 3 NOT OK captures on 10 Jun 2031.")
    assert len(r.rows) == 3


def test_top_failures_by_operator_tie_and_2359_rule(seed):
    a, b = seed["A"], seed["B"]
    r = run("top_failures_by_operator", now=NOW)
    # B's 23:59:30 NOT OK is outside 00:00-23:59 (as in Reports); with it B would lead 4-3.
    assert r.rows == [[a, "Asha A", 2, 1, 3, 6], [b, "Bala B", 1, 2, 3, 4]]
    assert r.text == f"Most failures on 10 Jun 2031: {a} (Asha A) and {b} (Bala B) with 3 (tied)."
    r = run("top_failures_by_operator", {"date": "2031-06-09"}, now=NOW)
    assert r.rows == [[a, "Asha A", 1, 0, 1, 4]]
    assert r.text == f"Most failures on 9 Jun 2031: {a} (Asha A) with 1."
    r = run("top_failures_by_operator", {"date": "2031-06-08"}, now=NOW)
    assert r.text == "No failures on 8 Jun 2031." and r.rows == []


def test_compare_days(seed):
    r = run("compare_days", now=NOW)
    assert r.text == "10 Jun 2031: 10 captures vs 9 Jun 2031: 4 (+6, +150%)."
    assert r.rows == [["10 Jun 2031", 10, 4, 3, 3], ["9 Jun 2031", 4, 3, 1, 0]]
    r = run("compare_days", {"day_a": "2031-06-09", "day_b": "2031-06-08"}, now=NOW)
    assert r.text == "9 Jun 2031: 4 captures vs 8 Jun 2031: 0 (+4, n/a)."


def test_bad_params_ask_to_rephrase(seed):
    for intent, params in [("compare_days", {"day_a": "someday"}),
                           ("not_ok_list", {"limit": 500}),
                           ("top_failures_by_operator", {"date": "31-02-2031"})]:
        r = run(intent, params, now=NOW)
        assert r.text.startswith("I couldn't understand that date or option.") and r.rows == []
    with pytest.raises(ValueError):
        run("drop_tables", now=NOW)


def test_queries_run_read_only(seed):
    from sqlalchemy.exc import DBAPIError

    with SessionLocal() as db:
        before = db.scalar(select(models.Operator.id).where(models.Operator.id == "OP_CHAT_RO"))
    with pytest.raises(DBAPIError, match="read-only transaction"):
        with tools._readonly() as db:
            db.execute(insert(models.Operator).values(id="OP_CHAT_RO", name="x"))
    with SessionLocal() as db:
        after = db.scalar(select(models.Operator.id).where(models.Operator.id == "OP_CHAT_RO"))
    assert before is None and after is None
