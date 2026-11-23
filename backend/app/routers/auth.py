from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from app.deps import require_admin

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get(
    "/verify",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_admin)],
)
def verify_admin() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
