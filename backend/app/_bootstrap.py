"""Run side-effects required before the legacy modules are imported.

The legacy `config.py` resolves all data-file paths from `os.getcwd()`, so we
chdir into `AOI_DATA_DIR` first. In the container this is `/data`; in local dev
it falls back to the repo's `./data` directory. The package `backend/legacy` is
also exposed on `sys.path` under the name `legacy` so its modules can `import
config`, `from email_sender import ...` exactly as they did inside
`aoi_system_updated/`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def init() -> Path:
    here = Path(__file__).resolve().parent.parent  # backend/
    legacy_dir = here / "legacy"

    if str(legacy_dir) not in sys.path:
        sys.path.insert(0, str(legacy_dir))

    data_dir = Path(os.environ.get("AOI_DATA_DIR", here.parent / "data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "detection_results").mkdir(parents=True, exist_ok=True)
    (data_dir / "reports").mkdir(parents=True, exist_ok=True)

    os.chdir(data_dir)
    return data_dir


DATA_DIR = init()
