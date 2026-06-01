"""Runtime data path helpers for development and packaged builds."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional


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


def resolve_e57_path(stored_path: Optional[str], uploads_dir: Optional[Path] = None) -> Optional[str]:
    """Resolve a stored ``e57Path`` to an existing file on disk.

    The stored value may be a full absolute path (file picked via the native
    dialog) or just a bare filename. The latter happens for legacy projects
    created when a file was drag-dropped in Electron >=32, where the
    non-standard ``File.path`` property was removed, so only ``file.name`` was
    available to the renderer.

    Resolution order:
    1. Use ``stored_path`` directly if it exists.
    2. Look for an exact filename match in the uploads directory.
    3. Look for an uploaded copy stored as ``<uuid>_<filename>``; only use it
       when exactly one candidate matches, so we never silently load the wrong
       scan.

    Returns the resolved path, or ``None`` if no existing file can be found.
    """
    if not stored_path:
        return None

    direct = Path(stored_path)
    if direct.exists():
        return str(direct)

    if uploads_dir is None:
        uploads_dir = get_data_root() / "uploads"
    uploads_dir = Path(uploads_dir)

    name = direct.name
    exact = uploads_dir / name
    if exact.exists():
        return str(exact)

    if uploads_dir.exists():
        matches = sorted(uploads_dir.glob(f"*_{name}"))
        if len(matches) == 1:
            return str(matches[0])

    return None


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
