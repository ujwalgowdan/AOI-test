from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.adapters import legacy
from app.deps import require_admin, require_station_token
from app.schemas import Person, PersonCreate

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=list[Person], dependencies=[Depends(require_station_token)])
def list_employees() -> list[Person]:
    return [Person(**e) for e in legacy.employees.get_all_employees()]


@router.post("", response_model=Person, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
def add_employee(body: PersonCreate) -> Person:
    with legacy.write_lock:
        ok, message = legacy.employees.add_employee(body.name, body.id)
    if not ok:
        raise HTTPException(status.HTTP_409_CONFLICT, message)
    return Person(id=body.id, name=body.name)


@router.delete(
    "/{emp_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_admin)],
)
def remove_employee(emp_id: str) -> Response:
    with legacy.write_lock:
        ok, message = legacy.employees.remove_employee(emp_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, message)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
