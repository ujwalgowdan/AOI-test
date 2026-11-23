"""Chat step 3: keyword matcher (no LLM). Question -> data intent, card or action.

Ordered rules over a normalised, space-padded string; the first rule that fits
wins. The matcher only chooses a target and its parameters; every answer text
comes from tools.py templates or cards.yaml.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Callable, Optional

import yaml  # type: ignore[import-untyped]  # PyYAML ships no stubs; types-PyYAML not installed

from app.services.chat.intents import resolve_day

CARDS_FILE = Path(__file__).with_name("cards.yaml")


@dataclass
class Match:
    kind: str  # "data" | "card" | "action"
    target: str
    params: dict = field(default_factory=dict)


@lru_cache(maxsize=1)
def cards() -> dict[str, dict]:
    data = yaml.safe_load(CARDS_FILE.read_text(encoding="utf-8"))
    return {c["id"]: c for c in data["cards"]}


def _norm(q: str) -> str:
    t = q.lower().replace("’", "'").replace("'s ", " ").replace("'", "")
    t = re.sub(r"[^a-z0-9/-]+", " ", t)
    return f" {' '.join(t.split())} "


def _has(t: str, *phrases: str) -> bool:
    return any(f" {p} " in t for p in phrases)


_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b")


def _dates(t: str) -> list[str]:
    return _DATE.findall(t)


def _day(t: str) -> str:
    ds = _dates(t)
    return ds[0] if ds else ("yesterday" if _has(t, "yesterday") else "today")


def _compare(t: str) -> dict:
    ds = _dates(t)
    if len(ds) >= 2:
        return {"day_a": ds[0], "day_b": ds[1]}
    if len(ds) == 1:
        return {"day_a": ds[0], "day_b": "yesterday"}
    return {}


def _zip(t: str) -> dict:
    ds = _dates(t)
    return {"start": ds[0], "end": ds[1]} if len(ds) >= 2 else {}


DIFF = ("different", "differ", "difference", "mismatch", "match", "wrong", "add up", "not same")
FAILED = ("failed", "fail", "failure", "not ok", "rejected", "bad")
LAST = ("last", "latest", "previous", "recent", "most recent")
PEOPLE = ("operator", "operators", "inspector", "inspectors", "employee", "employees",
          "person", "people", "worker", "workers")

Rule = tuple[str, str, Callable[[str], bool], Callable[[str], dict]]
_none: Callable[[str], dict] = lambda t: {}  # noqa: E731

RULES: list[Rule] = [
    ("card", "backup_before_shutdown", lambda t: _has(t, "backup", "back up", "backups"), _none),
    ("action", "download_zip",
     lambda t: _has(t, "zip") or (_has(t, "download") and _has(t, "captures", "images", "photos")),
     _zip),
    ("action", "export_daily_report",
     lambda t: _has(t, "export", "download", "print", "generate") and _has(t, "report", "pdf"), _none),
    ("card", "camera_not_ready",
     lambda t: _has(t, "camera", "webcam", "acquiring", "align both wires", "capture button",
                    "capture is disabled", "capture disabled"), _none),
    ("card", "change_wire_order",
     lambda t: _has(t, "wire", "wires", "colour", "color", "colours", "colors")
     and _has(t, "order", "sequence", "position"), _none),
    ("card", "restart_stuck_live",
     lambda t: _has(t, "restart", "restarted", "reboot", "rebooted", "stuck", "frozen",
                    "unknown session", "session is not active", "data safe", "lost my data"), _none),
    ("card", "add_person",
     lambda t: _has(t, *PEOPLE) and _has(t, "add", "new", "register", "create", "remove",
                                       "delete", "enroll"), _none),
    ("card", "start_session",
     lambda t: _has(t, "start", "begin", "new", "open") and _has(t, "session", "inspection", "testing"),
     _none),
    ("card", "daily_count_vs_dashboard",
     lambda t: _has(t, *DIFF) and _has(t, "dashboard", "screen", "daily count", "today card",
                                     "report", "reports"), _none),
    ("data", "compare_days",
     lambda t: _has(t, "compare", "comparison")
     or (_has(t, "yesterday") and _has(t, "vs", "versus", "than", "difference", "more", "less",
                                       "fewer", "with")), _compare),
    ("data", "session_counts",
     lambda t: _has(t, "this session", "current session", "my session", "the session"), _none),
    ("data", "top_failures_by_operator",
     lambda t: _has(t, "operator", "operators", "who", "worker")
     and _has(t, "most", "highest", "top", "worst", "maximum", "max"),
     lambda t: {"date": _day(t)}),
    ("data", "explain_last_capture",
     lambda t: _has(t, "why") and _has(t, *FAILED, "not detected", "wrong", *LAST), _none),
    ("data", "last_failed_capture", lambda t: _has(t, *LAST) and _has(t, *FAILED), _none),
    ("data", "not_ok_list",
     lambda t: _has(t, "not ok", "not okay", "nok", "failures", "failed captures", "rejects")
     and _has(t, "show", "list", "all", "which", "see", "display"),
     lambda t: {"date": _day(t), "shift_requested": _has(t, "shift", "this shift")}),
    ("data", "my_count_today",
     lambda t: _has(t, "how many", "count", "number of", "total")
     and _has(t, "i", "my", "me", "ive", "i have"), _none),
]


def build(target: str, question: str, now: Optional[datetime] = None) -> Match:
    """Match for a known target, with its parameters extracted in Python."""
    kind, _, _, params = next(r for r in RULES if r[1] == target)
    p = params(_norm(question))
    if target == "download_zip":
        for k in p:  # validate dates in Python; bad ones -> no prefill
            try:
                resolve_day(p[k], now)
            except ValueError:
                return Match(kind, target, {})
    return Match(kind, target, p)


def match(question: str, now: Optional[datetime] = None) -> Optional[Match]:
    t = _norm(question)
    for _, target, fits, _ in RULES:
        if fits(t):
            return build(target, question, now)
    return None


TARGETS = [r[1] for r in RULES]
