"""ORM models for the AOI system.

Tables:
- `operators` — what the UI calls "Operators" (legacy code calls them
  "employees" — the rename happens at the DB seam to make the schema
  self-describing).
- `inspectors` — first-piece inspectors.
- `sessions` — one row per START → STOP cycle on the dashboard.
- `captures` — one row per Spacebar capture (= one row per cable
  tested). Stores result, detected/expected colour order, and the
  filesystem path of the annotated JPEG that lives under
  `AOI_DATA_DIR/detection_results/`.

Images themselves stay on disk (cheaper, faster, easy to back up
separately). The DB row is the index — query by date / operator /
inspector / result.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import DateTime


class Base(DeclarativeBase):
    pass


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Inspector(Base):
    __tablename__ = "inspectors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SessionRow(Base):
    """One row per START → STOP on the dashboard.

    `captures` reference `session_id` (as plain text, not FK) because
    in-memory sessions exist before they hit the DB — keeping the column
    as text avoids ordering coupling between the analyse handler and
    session bootstrap.
    """

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # uuid hex
    operator_id: Mapped[str] = mapped_column(ForeignKey("operators.id"), nullable=False)
    inspector_id: Mapped[str] = mapped_column(ForeignKey("inspectors.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    operator: Mapped["Operator"] = relationship(lazy="joined")
    inspector: Mapped["Inspector"] = relationship(lazy="joined")


class Capture(Base):
    """One row per Spacebar capture.

    `image_path` is relative to `AOI_DATA_DIR` so the row stays portable
    across deploys. `result` is the same string the rest of the app
    uses: 'OK', 'NOT OK', or 'NOT DETECTED'.
    """

    __tablename__ = "captures"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    operator_id: Mapped[str] = mapped_column(ForeignKey("operators.id"), nullable=False)
    inspector_id: Mapped[str] = mapped_column(ForeignKey("inspectors.id"), nullable=False)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    detected_order: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}", nullable=False
    )
    expected_order: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}", nullable=False
    )
    image_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    operator: Mapped["Operator"] = relationship(lazy="joined")
    inspector: Mapped["Inspector"] = relationship(lazy="joined")

    __table_args__ = (
        Index("captures_captured_at_idx", "captured_at"),
        Index("captures_session_id_idx", "session_id"),
    )
