"""Postgres persistence layer.

Replaces the legacy JSON / XLSX flat files. The public seam for the rest
of the app is still `app.adapters.legacy` — operators, inspectors, and
captures are exposed through facades there with the same method names
the routers used in the file-based era, so router code didn't change.

`engine.py` builds the SQLAlchemy engine + session factory from the
`DATABASE_URL` env var. `models.py` defines the Operator / Inspector /
Session / Capture tables. `init.py` creates the schema and runs the
one-shot JSON-import migration on backend startup.
"""
