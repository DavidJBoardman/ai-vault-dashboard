"""Runtime data path helpers for development and packaged builds."""

from __future__ import annotations

import os
from pathlib import Path


DATA_ROOT_ENV = "VAULT_ANALYSER_DATA_ROOT"


def get_data_root() -> Path:
    """Return the runtime data root.

    Development defaults to the repo-local backend/data directory.
    Packaged builds can override this via ``VAULT_ANALYSER_DATA_ROOT``.
    """
    override = os.getenv(DATA_ROOT_ENV)
    if override:
        return Path(override).expanduser().resolve()

    return Path(__file__).resolve().parents[1] / "data"


def ensure_data_dirs() -> Path:
    """Create the standard runtime data directories and return the root."""
    data_root = get_data_root()
    data_root.mkdir(parents=True, exist_ok=True)

    for name in ("uploads", "projections", "segmentations", "exports", "projects"):
        (data_root / name).mkdir(parents=True, exist_ok=True)

    return data_root
