from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.adapters import legacy
from app.deps import require_admin, require_station_token
from app.schemas import Person, PersonCreate, PersonUpdate

router = APIRouter(prefix="/api/inspectors", tags=["inspectors"])


@router.get("", response_model=list[Person], dependencies=[Depends(require_station_token)])
def list_inspectors() -> list[Person]:
    return [Person(**i) for i in legacy.inspectors.get_all_inspectors()]


@router.post("", response_model=Person, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
def add_inspector(body: PersonCreate) -> Person:
    with legacy.write_lock:
        ok, message = legacy.inspectors.add_inspector(body.name, body.id)
    if not ok:
        raise HTTPException(status.HTTP_409_CONFLICT, message)
    return Person(id=body.id, name=body.name)


@router.put("/{inspector_id}", response_model=Person,
            dependencies=[Depends(require_admin)])
def update_inspector(inspector_id: str, body: PersonUpdate) -> Person:
    with legacy.write_lock:
        outcome, message = legacy.inspectors.update_inspector(
            inspector_id, body.name, body.id
        )
    if outcome == "not_found":
        raise HTTPException(status.HTTP_404_NOT_FOUND, message)
    if outcome == "conflict":
        raise HTTPException(status.HTTP_409_CONFLICT, message)
    final_id = body.id or inspector_id
    found = legacy.inspectors.get_inspector_by_id(final_id)
    if not found:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Inspector vanished after update")
    return Person(**found)


@router.delete(
    "/{inspector_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_admin)],
)
def remove_inspector(inspector_id: str) -> Response:
    with legacy.write_lock:
        ok, message = legacy.inspectors.remove_inspector(inspector_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, message)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
