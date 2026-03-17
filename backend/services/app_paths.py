"""Runtime data path helpers for development and packaged builds."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


DATA_ROOT_ENV = "VAULT_ANALYSER_DATA_ROOT"
LEGACY_DATA_ROOTS_ENV = "VAULT_ANALYSER_LEGACY_DATA_ROOTS"


def _default_legacy_data_roots() -> list[Path]:
    return [
        Path.home() / "Vault Analyzer",
    ]


def get_legacy_data_roots() -> list[Path]:
    """Return known legacy runtime data roots in priority order."""
    configured = os.getenv(LEGACY_DATA_ROOTS_ENV, "")
    configured_roots = [Path(value).expanduser() for value in configured.split(os.pathsep) if value.strip()]

    seen: set[Path] = set()
    roots: list[Path] = []
    for candidate in configured_roots + _default_legacy_data_roots():
        try:
            resolved = candidate.resolve(strict=False)
        except Exception:
            resolved = candidate
        if resolved in seen:
            continue
        seen.add(resolved)
        roots.append(candidate)

    return roots


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
    if os.getenv(DATA_ROOT_ENV):
        for legacy_root in get_legacy_data_roots():
            if legacy_root == data_root or not legacy_root.exists() or data_root.exists():
                continue
            try:
                shutil.copytree(legacy_root, data_root)
                break
            except Exception:
                # Best-effort migration only; continue with the configured root.
                break

    data_root.mkdir(parents=True, exist_ok=True)

    for name in ("uploads", "projections", "segmentations", "exports", "projects"):
        (data_root / name).mkdir(parents=True, exist_ok=True)

    return data_root
