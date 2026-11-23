"""Chat step 3: input rules, applied before anything else looks at the question.

Plain Python, no model. A refusal never echoes the user's text back.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

MAX_CHARS = 300

REFUSALS = {
    "empty": "Please type a question.",
    "too_long": f"Please keep your question under {MAX_CHARS} characters.",
    "secret_request": "I can't help with passwords, tokens or system settings. Ask your administrator.",
    "injection": "I can only answer questions about inspection data and how to use this station.",
    "write_request": "I only read inspection data. I can't add, change, delete, start or stop anything.",
    "admin_required": "Sign in as admin on the Admin page to see this.",
}

_SECRET = re.compile(
    r"\b(pass\s*words?|passwd|pwd|tokens?|secrets?|api\s*keys?|credentials?|"
    r"admin_password|database_url|connection\s*string|\.env)\b|\.env\b"
)
_INJECTION = re.compile(
    r"(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules?|prompts?|guardrails?)"
    r"|system\s*prompt|developer\s*mode|jailbreak|\byou\s+are\s+now\b|\bact\s+as\b|\bpretend\b"
    r"|</?\s*(system|assistant|user)\s*>|\[\s*(system|inst)\s*\]"
    r"|\bselect\s+\*|\bunion\s+(all\s+)?select\b|\bselect\b.+\bfrom\b.+\bwhere\b|\bdrop\s+table\b|\binsert\s+into\b|\bdelete\s+from\b"
    r"|\bupdate\s+\w+\s+set\b|\btruncate\b|;\s*--|\bexec(ute)?\s*\("
)
_WRITE_VERB = re.compile(
    r"\b(add|create|insert|delete|remove|drop|update|change|edit|modify|rename|reset|clear|"
    r"wipe|erase|set|start|stop|end|alter|overwrite|close|approve|mark)\b"
)
# A question about HOW to do something (or a problem report) is not a command.
_QUESTION_LEAD = re.compile(
    r"^(how|where|what|why|when|which|who|whose|can i|could i|may i|is|are|am|do|does|did|"
    r"should|help|explain|tell me how|show me how|i want to know)\b"
)
# Problem reports describe what happened ("it says unknown session when I press
# end"); they mention action words without asking the assistant to act.
_TROUBLE = re.compile(
    r"not working|doesn ?t work|won ?t|stuck|error|fails?|failed|can ?t|cannot"
    r"|\b(it|screen|app|button|badge) (says|said|shows|showed|is showing)\b"
    r"|\b(says|shows|showing|appears|message|pop ?up)\b.*\b(when|after|whenever|if) i\b"
    r"|\b(when|after|whenever|if) i (press|click|tap|hit|try)\b"
)
# Hinglish puts the question word anywhere ("naya session kaise start kare?").
_HINGLISH_Q = re.compile(r"\b(kaise|kaisa|kyun|kyon|kyu|kya|kitne|kitna|kitni|kahan|kab|kaun|batao|bataiye|bataye)\b")


def clean(question: str) -> str:
    """Drop control/format characters and collapse whitespace."""
    text = "".join(ch for ch in question if unicodedata.category(ch)[0] != "C" or ch in "\t\n ")
    return " ".join(text.split())


def normalise(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s.:/<>\[\]();*='-]", " ", text.lower()).split())


def check(question: str) -> tuple[Optional[str], str]:
    """Return (refusal reason or None, cleaned question)."""
    q = clean(question)
    if not q:
        return "empty", q
    if len(q) > MAX_CHARS:
        return "too_long", q
    low = normalise(q)
    if _INJECTION.search(low):
        return "injection", q
    if _SECRET.search(low):
        return "secret_request", q
    if (_WRITE_VERB.search(low) and not _QUESTION_LEAD.match(low) and not _TROUBLE.search(low)
            and not _HINGLISH_Q.search(low)):
        return "write_request", q
    return None, q
