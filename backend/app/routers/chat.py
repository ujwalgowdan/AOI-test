"""POST /api/chat - the assistant, step 3: guard + keyword matcher, no LLM.

Every reply is one of: a data-intent template (tools.py), a reviewed card
(cards.yaml), an action button for an existing export, or a fixed refusal /
fallback text. Nothing here generates free text or writes to the database.

Permissions mirror the screens each answer comes from:
- router level: station token (same as Dashboard / Reports routes, F-05);
- report-type data and "Export daily report": require_admin_if_station_mode,
  like POST /api/reports/range/generate;
- "Download captures as ZIP": require_admin, like GET /api/captures/download.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.deps import require_admin, require_admin_if_station_mode
from app.schemas import ChatAction, ChatCard, ChatRequest, ChatResponse
from app.services.chat import guard, llm
from app.services.chat.intents import resolve_day, run
from app.services.chat.match import Match, build, cards, match
from app.services.clock import now_ist

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("aoi.chat")

ADMIN_IF_STATION = {"not_ok_list", "top_failures_by_operator", "compare_days", "export_daily_report"}
ADMIN = {"download_zip"}

UNKNOWN = ("I can answer questions about inspection results, sessions and how to use this "
           "station. Try one of these:")
SUGGESTIONS = [
    "How many cables have I tested today?",
    "Why did the last capture fail?",
    "How many OK vs NOT OK in this session?",
    "Which operator had the most failures today?",
    "Camera says not ready, what should I do?",
    "How do I take a backup before shutting down?",
]


def _card(card_id: str) -> ChatCard:
    c = cards()[card_id]
    return ChatCard(id=c["id"], title=c["title"], answer=c["answer"].rstrip())


def _refusal(reason: str, card: Optional[ChatCard] = None) -> ChatResponse:
    return ChatResponse(kind="refusal", reason=reason, text=guard.REFUSALS[reason], card=card)


def _permitted(m: Match, request: Request, authorization: Optional[str]) -> bool:
    try:
        if m.target in ADMIN:
            require_admin(request, authorization)
        elif m.target in ADMIN_IF_STATION:
            require_admin_if_station_mode(request, authorization)
    except HTTPException as exc:
        if exc.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
            return False
        raise  # 429 lockout / 503 admin disabled: same as the screens
    return True


def _action(m: Match) -> ChatAction:
    if m.target == "export_daily_report":
        day = resolve_day("today").isoformat()
        return ChatAction(name=m.target, label="Export daily report",
                          start=f"{day}T00:00", end=f"{day}T23:59")
    start, end = (resolve_day(m.params[k]).isoformat() if k in m.params else None
                  for k in ("start", "end"))
    return ChatAction(name=m.target, label="Open Reports to download the ZIP", start=start, end=end)


def route(q: str) -> tuple[Optional[Match], str]:
    """LLM picks the target when it is up; the keyword matcher answers whenever the
    LLM is off, down, timed out, busy, unsure ("none") or returns garbage."""
    target = llm.classify(q)
    if target and target != "none":
        return build(target, q), "llm"
    return match(q), "keywords"


def answer(body: ChatRequest, request: Request, authorization: Optional[str]) -> ChatResponse:
    reason, q = guard.check(body.question)
    if reason == "write_request":
        m = match(q)
        return _refusal(reason, _card(m.target) if m and m.kind == "card" else None)
    if reason:
        return _refusal(reason)
    m, by = route(q)
    res = _respond(m, body, request, authorization)
    res.matched_by = by
    return res


def _respond(m: Optional[Match], body: ChatRequest, request: Request,
             authorization: Optional[str]) -> ChatResponse:
    if m is None:
        return ChatResponse(kind="unknown", text=UNKNOWN, suggestions=SUGGESTIONS)
    if not _permitted(m, request, authorization):
        return _refusal("admin_required")
    if m.kind == "card":
        card = _card(m.target)
        return ChatResponse(kind="card", text=card.answer, card=card)
    if m.kind == "action":
        act = _action(m)
        return ChatResponse(kind="action", text=act.label, action=act)
    r = run(m.target, m.params, session_id=body.session_id, now=now_ist())
    return ChatResponse(kind="data", intent=r.intent, text=r.text, columns=r.columns,
                        rows=r.rows, source=r.source, image_url=r.image_url)


@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, request: Request,
         authorization: Optional[str] = Header(default=None)) -> ChatResponse:
    t0 = time.monotonic()
    res = answer(body, request, authorization)
    # Never log the question text: people sometimes type passwords into chat boxes.
    log.info("chat kind=%s target=%s reason=%s chars=%d ms=%d", res.kind,
             res.intent or (res.card.id if res.card else None) or (res.action.name if res.action else None),
             res.reason, len(body.question), (time.monotonic() - t0) * 1000)
    return res
