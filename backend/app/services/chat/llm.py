"""Chat step 4: Ollama intent classifier. It only picks a target name; parameters
come from Python (match.build) and answer text from templates/cards.

Off unless OLLAMA_URL is set. Any failure (down, timeout, busy, bad JSON, unknown
target) returns None and the caller falls back to the keyword matcher.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Optional

import httpx

from app.services.chat.match import TARGETS

TIMEOUT_S = 15.0
PROMPT = Path(__file__).with_name("classifier_prompt.txt").read_text(encoding="utf-8")
SCHEMA = {"type": "object", "required": ["target"],
          "properties": {"target": {"type": "string", "enum": [*TARGETS, "none"]}}}
# ponytail: one call at a time, others fall back instantly (keeps the CPU for the
# camera); a queue would only make operators wait.
_lock = threading.Lock()


def _keep_alive() -> int | str:
    # -1 = keep the model loaded (no 15 s cold start after idle); "30m" etc. also work.
    v = os.getenv("CHAT_KEEP_ALIVE", "-1").strip()
    return int(v) if v.lstrip("-").isdigit() else v


def _classify_body(question: str, num_predict: int = 24) -> dict:
    return {"model": os.getenv("CHAT_MODEL", "qwen2.5:3b"), "stream": False, "format": SCHEMA,
            "keep_alive": _keep_alive(), "options": {"temperature": 0, "num_predict": num_predict},
            "messages": [{"role": "system", "content": PROMPT},
                         {"role": "user", "content": question}]}


def warm() -> bool:
    """Backend startup: (1) load the model, (2) run the classifier prompt once so
    Ollama caches it and the first real question is fast. One call at a time, each
    within the 15 s timeout; questions asked meanwhile use the keyword matcher. If a
    step times out, Ollama finishes loading anyway."""
    url = os.getenv("OLLAMA_URL", "").rstrip("/")
    if not url or not _lock.acquire(blocking=False):
        return False
    try:
        load: dict = {"model": os.getenv("CHAT_MODEL", "qwen2.5:3b"), "messages": [],
                "keep_alive": _keep_alive()}
        httpx.post(f"{url}/api/chat", timeout=TIMEOUT_S, json=load).raise_for_status()
        httpx.post(f"{url}/api/chat", timeout=TIMEOUT_S,
                   json=_classify_body("warm-up", num_predict=1)).raise_for_status()
        return True
    except httpx.HTTPError:
        return False
    finally:
        _lock.release()


def classify(question: str) -> Optional[str]:
    url = os.getenv("OLLAMA_URL", "").rstrip("/")
    if not url or not _lock.acquire(blocking=False):
        return None
    try:
        r = httpx.post(f"{url}/api/chat", timeout=TIMEOUT_S, json=_classify_body(question))
        r.raise_for_status()
        target = json.loads(r.json()["message"]["content"])["target"]
        return target if target in TARGETS or target == "none" else None
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None
    finally:
        _lock.release()
