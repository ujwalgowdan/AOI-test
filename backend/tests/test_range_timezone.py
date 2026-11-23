"""F-25: POST /api/reports/range/generate with one naive and one offset-aware
bound must compare instants correctly instead of returning a 500.

Policy A (approved): only when exactly one bound is naive, the aware bound is
converted to IST and its tzinfo dropped, so the request behaves exactly like an
all-naive IST request (naive already means IST: the DB engine pins every
session to Asia/Kolkata). All-naive and all-aware requests are unchanged.

Needs Postgres (skips otherwise). Synthetic captures on 2031-03-15 at
10:00, 12:00 and 14:00 IST; the PDF builder is replaced by a recorder.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

try:
    from app.adapters import legacy
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
    from app.services.clock import IST
except Exception as exc:
    pytest.skip(f"backend imports failed: {exc}", allow_module_level=True)

URL = "/api/reports/range/generate"
DAY = (2031, 3, 15)
# Date-crossing fixtures (IST): 04-20 23:30, 04-21 00:30, 04-21 06:00, 04-22 01:00.
CROSSING = [(2031, 4, 20, 23, 30), (2031, 4, 21, 0, 30), (2031, 4, 21, 6, 0), (2031, 4, 22, 1, 0)]


@pytest.fixture(scope="module", autouse=True)
def seeded():
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Operator).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")
    tag = uuid.uuid4().hex[:8]
    op, ins, sess = f"OP_TZ_{tag}", f"IN_TZ_{tag}", f"sess_tz_{tag}"
    with SessionLocal() as db:
        db.add_all([models.Operator(id=op, name="Tz Op"), models.Inspector(id=ins, name="Tz Insp")])
        db.flush()
        for hour in (10, 12, 14):
            db.add(models.Capture(
                session_id=sess, operator_id=op, inspector_id=ins, result="OK",
                detected_order=["yellow", "green"], expected_order=["yellow", "green"],
                image_path=None, captured_at=datetime(*DAY, hour, 0, tzinfo=IST),
            ))
        for y, mo, d, h, mi in CROSSING:
            db.add(models.Capture(
                session_id=sess, operator_id=op, inspector_id=ins, result="OK",
                detected_order=["yellow", "green"], expected_order=["yellow", "green"],
                image_path=None, captured_at=datetime(y, mo, d, h, mi, tzinfo=IST),
            ))
        db.commit()
    yield
    with SessionLocal() as db:
        db.execute(delete(models.Capture).where(models.Capture.session_id == sess))
        db.execute(delete(models.Inspector).where(models.Inspector.id == ins))
        db.execute(delete(models.Operator).where(models.Operator.id == op))
        db.commit()


@pytest.fixture
def report(monkeypatch, tmp_path):
    """Call the endpoint; return (status, report_data or detail)."""
    seen: dict = {}

    def fake_pdf(data, save_to_downloads=False):
        seen["data"] = data
        p = tmp_path / "range.pdf"
        p.write_bytes(b"%PDF-1.4 test")
        return str(p)

    monkeypatch.setattr(legacy, "generate_report_pdf", fake_pdf)
    client = TestClient(app, raise_server_exceptions=False)

    def call(start, end):
        r = client.post(URL, json={"start": start, "end": end})
        if r.status_code == 200:
            d = seen["data"]
            return 200, (d["date"], d["total_tested"])
        return r.status_code, r.text[:120]

    return call


# ---------- corrected cases (mixed naive/aware): 500 -> correct result ----------

@pytest.mark.parametrize(("start", "end", "expected"), [
    # naive start (IST) + aware end in IST: 09:30-12:30 IST -> 10:00, 12:00
    ("2031-03-15T09:30", "2031-03-15T12:30+05:30", (200, ("2031-03-15", 2))),
    # aware start in UTC (= 09:30 IST) + naive end (IST 12:30) -> 10:00, 12:00
    ("2031-03-15T04:00Z", "2031-03-15T12:30", (200, ("2031-03-15", 2))),
    # naive start 11:00 IST + aware end 09:00Z (= 14:30 IST) -> 12:00, 14:00
    ("2031-03-15T11:00", "2031-03-15T09:00Z", (200, ("2031-03-15", 2))),
])
def test_mixed_naive_aware_compares_instants(report, start, end, expected):
    assert report(start, end) == expected


def test_mixed_end_before_start_by_instant_is_400(report):
    # end 05:00Z = 10:30 IST, before the naive 12:00 IST start
    status, body = report("2031-03-15T12:00", "2031-03-15T05:00Z")
    assert status == 400 and "end must be on or after start" in body


# ---------- unchanged cases (same result before and after the fix) ----------

@pytest.mark.parametrize(("start", "end", "expected"), [
    ("2031-03-15T09:30", "2031-03-15T12:30", (200, ("2031-03-15", 2))),            # all naive (IST)
    ("2031-03-15T09:30+05:30", "2031-03-15T12:30+05:30", (200, ("2031-03-15", 2))),  # all aware IST
    ("2031-03-15T04:00Z", "2031-03-15T07:00Z", (200, ("2031-03-15", 2))),          # all aware UTC
    ("2031-03-14T00:00", "2031-03-15T00:00", (200, ("2031-03-14 00:00 to 2031-03-15 23:59", 3))),  # end-of-day rule
])
def test_unchanged_naive_only_and_aware_only(report, start, end, expected):
    assert report(start, end) == expected


def test_unchanged_end_before_start_naive(report):
    status, body = report("2031-03-15T12:00", "2031-03-15T10:00")
    assert status == 400 and "end must be on or after start" in body


# ---------- date-crossing cases (fixtures: CROSSING) ----------
# Corrected (mixed naive/offset; 500 today). Policy A: the offset bound is
# expressed as naive IST wall-clock; label and end-of-day rule then use IST.

@pytest.mark.parametrize(("start", "end", "expected"), [
    # X1: end 19:30Z = 04-21 01:00 IST -> label crosses into 04-21
    ("2031-04-20T23:00", "2031-04-20T19:30Z", (200, ("2031-04-20 23:00 to 2031-04-21 01:00", 2))),
    # X2: start 18:30Z = 04-21 00:00 IST (midnight) -> end-of-day rule extends end to 04-22 23:59
    ("2031-04-20T18:30Z", "2031-04-22T00:00", (200, ("2031-04-21 00:00 to 2031-04-22 23:59", 3))),
    # X3: end 18:30Z = 04-22 00:00 IST (midnight) -> treated as a date pick, end-of-day to 04-22 23:59
    ("2031-04-21T00:00", "2031-04-21T18:30Z", (200, ("2031-04-21 00:00 to 2031-04-22 23:59", 3))),
    # X4: start 19:00Z = 04-21 00:30 IST -> same IST date (UTC date is 04-20), inclusive bounds
    ("2031-04-20T19:00Z", "2031-04-21T06:00", (200, ("2031-04-21", 2))),
])
def test_mixed_crossing_midnight(report, start, end, expected):
    assert report(start, end) == expected


def test_mixed_crossing_end_before_start_is_400(report):
    # X5: end 18:35Z = 04-21 00:05 IST, before the naive 04-21 00:10 start
    status, body = report("2031-04-21T00:10", "2031-04-20T18:35Z")
    assert status == 400 and "end must be on or after start" in body


# Unchanged references (same result before and after the fix).

@pytest.mark.parametrize(("start", "end", "expected"), [
    # U1: all offset -> Policy A does not apply; label in the offset's own (UTC) wall-clock
    ("2031-04-20T18:30Z", "2031-04-21T18:30Z", (200, ("2031-04-20 18:30 to 2031-04-21 18:30", 2))),
    # U2: all naive, both midnight -> end-of-day rule (the reference X3 must match)
    ("2031-04-21T00:00", "2031-04-22T00:00", (200, ("2031-04-21 00:00 to 2031-04-22 23:59", 3))),
    # U3: all naive crossing midnight (the reference X1 must match)
    ("2031-04-20T23:00", "2031-04-21T01:00", (200, ("2031-04-20 23:00 to 2031-04-21 01:00", 2))),
])
def test_unchanged_crossing_references(report, start, end, expected):
    assert report(start, end) == expected
