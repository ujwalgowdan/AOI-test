from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Person(BaseModel):
    id: str
    name: str


class PersonCreate(BaseModel):
    id: str = Field(min_length=1, max_length=64)  # operators.id / inspectors.id are String(64)
    name: str = Field(min_length=1, max_length=255)  # operators.name / inspectors.name are String(255)


class PersonUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    id: Optional[str] = Field(default=None, max_length=64)


class SessionStart(BaseModel):
    employee_id: str
    inspector_id: str


class SessionState(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    inspector_id: str
    inspector_name: str
    start_time: str
    end_time: Optional[str] = None
    ok_count: int
    not_ok_count: int
    last_result: Optional[str] = None
    last_image_url: Optional[str] = None
    active: bool


class AnalyzeResponse(BaseModel):
    result: str
    detected_order: list[str]
    expected_order: list[str]
    image_url: Optional[str] = None
    ok_count: int
    not_ok_count: int
    centroids: list[dict] = Field(default_factory=list)


class PeekResponse(BaseModel):
    """Readiness probe shape — drives the camera-card READY/NOT DETECTED badge."""
    ready: bool
    detected: list[str]
    expected: list[str]


class DailySummary(BaseModel):
    date: str
    total_count: int
    pass_count: int
    fail_count: int
    cumulative_pass_rate: float
    tests: list[dict]


class HistoryRow(BaseModel):
    datetime: Optional[str] = None
    employee_name: Optional[str] = None
    inspector_name: Optional[str] = None
    total: Optional[int] = None
    ok: Optional[int] = None
    not_ok: Optional[int] = None


# ---- Chat (step 3: keyword matcher, no LLM) ----
class ChatRequest(BaseModel):
    # The guard enforces the 300-character rule with a friendly refusal; this cap
    # only bounds the request body.
    question: str = Field(max_length=2000)
    session_id: Optional[str] = Field(default=None, max_length=64)


class ChatCard(BaseModel):
    id: str
    title: str
    answer: str


class ChatAction(BaseModel):
    name: str  # "export_daily_report" | "download_zip"
    label: str
    start: Optional[str] = None
    end: Optional[str] = None


class ChatResponse(BaseModel):
    kind: str  # "data" | "card" | "action" | "refusal" | "unknown"
    text: str
    intent: Optional[str] = None
    reason: Optional[str] = None
    columns: list[str] = []
    rows: list[list[str | int | None]] = []
    source: str = ""
    image_url: Optional[str] = None
    card: Optional[ChatCard] = None
    action: Optional[ChatAction] = None
    suggestions: list[str] = []
    matched_by: Optional[str] = None  # "llm" | "keywords" (None for guard refusals)
