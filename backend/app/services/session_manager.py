"""In-memory tracking of active inspection sessions.

A session is one operator's continuous run between START and STOP. We hold
counts, last result, and (optionally) the most recent captured frame URL.
State files (`detection_results.xlsx`, `daily_test_log.json`) are still the
durable source of truth; this manager just keeps the live UI in sync.
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.services.clock import now_ist


@dataclass
class Session:
    id: str
    employee_id: str
    employee_name: str
    inspector_id: str
    inspector_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    ok_count: int = 0
    not_ok_count: int = 0
    last_result: Optional[str] = None
    last_image_url: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "employee_name": self.employee_name,
            "inspector_id": self.inspector_id,
            "inspector_name": self.inspector_name,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "ok_count": self.ok_count,
            "not_ok_count": self.not_ok_count,
            "last_result": self.last_result,
            "last_image_url": self.last_image_url,
            "active": self.end_time is None,
        }


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        # Per-session subscriber queues for WebSocket broadcast.
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def create(self, employee: dict, inspector: dict) -> Session:
        sid = uuid.uuid4().hex
        s = Session(
            id=sid,
            employee_id=str(employee["id"]),
            employee_name=str(employee["name"]),
            inspector_id=str(inspector["id"]),
            inspector_name=str(inspector["name"]),
            start_time=now_ist(),
        )
        with self._lock:
            self._sessions[sid] = s
        return s

    def get(self, sid: str) -> Optional[Session]:
        return self._sessions.get(sid)

    def list_active(self) -> list[Session]:
        return [s for s in self._sessions.values() if s.end_time is None]

    def stats(self) -> dict[str, int]:
        """Counts only (no ids/names): what a backend restart would cut off."""
        with self._lock:
            active = [sid for sid, s in self._sessions.items() if s.end_time is None]
            clients = sum(len(self._subscribers.get(sid, ())) for sid in active)
        return {"active_sessions": len(active), "websocket_clients": clients}

    def close(self, sid: str) -> Optional[Session]:
        with self._lock:
            s = self._sessions.get(sid)
            if s and s.end_time is None:
                s.end_time = now_ist()
            return s

    def record_capture(self, sid: str, result: str, image_url: Optional[str]) -> Optional[Session]:
        with self._lock:
            s = self._sessions.get(sid)
            if not s or s.end_time is not None:
                return None
            if result == "OK":
                s.ok_count += 1
            elif result == "NOT OK":
                s.not_ok_count += 1
            s.last_result = result
            s.last_image_url = image_url
            return s

    # ---- WebSocket fanout ----
    def subscribe(self, sid: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subscribers[sid].add(q)
        return q

    def unsubscribe(self, sid: str, q: asyncio.Queue) -> None:
        self._subscribers.get(sid, set()).discard(q)

    async def publish(self, sid: str, payload: dict) -> None:
        for q in list(self._subscribers.get(sid, set())):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                # Drop the slowest subscriber rather than block the producer.
                self._subscribers[sid].discard(q)


sessions = SessionManager()
