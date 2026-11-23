"""C-01 (batch 2): user-controlled header values must be shown literally in the
report PDF - no crash, no dropped text, no injected formatting, no entity
decoding - while the header labels keep their intentional bold.

Checks the parsed ReportLab Paragraph fragments (text + font per fragment),
not raw PDF bytes. The DB test drives the real range-report endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from reportlab.platypus import Paragraph
from sqlalchemy import delete, select

from app import _bootstrap  # noqa: F401  (legacy modules on sys.path)

import config  # type: ignore  # noqa: E402
import pdf_generator  # type: ignore  # noqa: E402

BOLD = "Helvetica-Bold"
VALUES = [
    "QA <Lead",         # open tag-like '<': crashed the parser
    "a<b",              # same, no spaces
    "Acme <Ltd>",       # unknown tag: text was silently dropped
    "Bob <b>Bold</b>",  # markup: formatting was injected
    "Tom &lt;x&gt;",    # entities: stored text was decoded
    "R&D Team",         # bare '&': rendered as 'R&D; Team'
    "A < B",            # tolerated before, must stay literal
    "John Doe",         # plain
]


def base(**kw):
    d = {"date": "2031-06-01", "time": "10:00:00", "employee_name": "John Doe", "employee_id": "EMP001",
         "inspector_name": "Mr. Vinay", "tests": [], "total_tested": 0, "ok_count": 0, "not_ok_count": 0,
         "start_time": "", "end_time": ""}
    d.update(kw)
    return d


def header_line(report_data, label):
    """(label_is_bold, value_text, value_has_injected_formatting) for the header
    Paragraph whose first fragment is `label`. A value fragment counts as
    formatted if its font differs from the paragraph style's own font (normal
    lines are Helvetica; the DAILY SUMMARY heading line is bold by design)."""
    _, title_style, heading_style, normal_style = pdf_generator._report_styles()
    paras = [e for e in pdf_generator._header_elements(report_data, title_style, heading_style, normal_style)
             if isinstance(e, Paragraph)]
    for p in paras:
        if p.frags and p.frags[0].text == label:
            rest = p.frags[1:]
            base_font = p.style.fontName
            return (p.frags[0].fontName == BOLD, "".join(f.text for f in rest),
                    any(f.fontName != base_font for f in rest))
    raise AssertionError(f"no header paragraph labelled {label!r}")


FIELDS = {
    # field: (report_data builder, label, expected value text)
    "employee_name": (lambda v: base(employee_name=v), "Operator:", lambda v: f" {v} (ID: EMP001)"),
    "employee_id": (lambda v: base(employee_id=v), "Operator:", lambda v: f" John Doe (ID: {v})"),
    "inspector_name": (lambda v: base(inspector_name=v), "First Piece Inspection:", lambda v: f" {v}"),
    "date": (lambda v: base(date=v), "Date:", lambda v: f" {v}"),
    "time": (lambda v: base(time=v), "Time:", lambda v: f" {v}"),
}


@pytest.mark.parametrize("value", VALUES)
@pytest.mark.parametrize("field", list(FIELDS))
def test_header_value_is_literal_and_label_bold(field, value):
    build, label, expected = FIELDS[field]
    label_bold, text, value_bold = header_line(build(value), label)
    assert label_bold
    assert text == expected(value)
    assert not value_bold


@pytest.mark.parametrize("value", VALUES)
def test_machine_name_is_literal_and_label_bold(monkeypatch, value):
    monkeypatch.setattr(config, "MACHINE_NAME", value)
    label_bold, text, value_bold = header_line(base(), "DAILY SUMMARY")
    assert label_bold
    assert text == f"- Machine: {value}"
    assert not value_bold


def test_missing_inspector_still_shows_na():
    data = {k: v for k, v in base().items() if k != "inspector_name"}
    assert header_line(data, "First Piece Inspection:") == (True, " N/A", False)


def test_full_pdf_builds_with_markup_names(tmp_path):
    path = pdf_generator.generate_report_pdf(
        base(employee_name="Acme <Ltd>", employee_id="ID<7>", inspector_name="QA <Lead"))
    with open(path, "rb") as f:
        assert f.read(5) == b"%PDF-"


# ---------- end to end: range report with a markup inspector name (needs Postgres) ----------

try:
    from app.db import init as db_init
    from app.db import models
    from app.db.engine import SessionLocal
    from app.main import app
    from app.services.clock import IST
    _DB_IMPORTS = True
except Exception:  # pragma: no cover
    _DB_IMPORTS = False


@pytest.fixture
def markup_capture():
    if not _DB_IMPORTS:
        pytest.skip("backend imports failed")
    try:
        db_init.init_schema()
        with SessionLocal() as db:
            db.execute(select(models.Operator).limit(1))
    except Exception as exc:
        pytest.skip(f"Postgres unreachable: {exc}")
    tag = uuid.uuid4().hex[:8]
    op, ins, sess = f"OP_C01_{tag}", f"IN_C01_{tag}", f"sess_c01_{tag}"
    with SessionLocal() as db:
        db.add_all([models.Operator(id=op, name="Acme <Ltd>"), models.Inspector(id=ins, name="QA <Lead")])
        db.flush()
        db.add(models.Capture(
            session_id=sess, operator_id=op, inspector_id=ins, result="OK",
            detected_order=["yellow", "green"], expected_order=["yellow", "green"],
            image_path=None, captured_at=datetime(2031, 6, 1, 10, 0, tzinfo=IST),
        ))
        db.commit()
    yield
    with SessionLocal() as db:
        db.execute(delete(models.Capture).where(models.Capture.session_id == sess))
        db.execute(delete(models.Inspector).where(models.Inspector.id == ins))
        db.execute(delete(models.Operator).where(models.Operator.id == op))
        db.commit()


def test_range_report_with_markup_names_is_200(markup_capture):
    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/api/reports/range/generate", json={"start": "2031-06-01T09:00", "end": "2031-06-01T11:00"})
    assert r.status_code == 200, r.text[:120]
    assert r.content[:5] == b"%PDF-"
