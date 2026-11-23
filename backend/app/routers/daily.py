from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.adapters import legacy

router = APIRouter(prefix="/api/daily", tags=["daily"])


@router.get("/summary")
def daily_summary() -> dict:
    summary = legacy.daily_counts.get_daily_summary()
    if not summary:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not load daily log")
    return summary
