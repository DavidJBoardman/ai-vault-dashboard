"""
Helper functions to generate summary reports for scoring and overlay steps.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict, List, Any

import pandas as pd


def _write_explanations_csv(path: Path, per_boss: Dict[object, Dict[str, Any]]) -> None:
    """Write per-boss explanations to CSV using pandas.json_normalize."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rows: List[Dict[str, Any]] = []
    for bid, info in per_boss.items():
        if isinstance(info, dict):
            rows.append({"boss_id": bid, **info})
    df = pd.json_normalize(rows, sep="_")
    df.to_csv(path, index=False)


def write_explanations_bundle(out_dir: Path, per_boss: Dict[object, Dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    # explanations.json
    with (out_dir / "explanations.json").open("w", encoding="utf-8") as f:
        json.dump(per_boss, f, indent=2)

    # explanations.csv
    _write_explanations_csv(out_dir / "explanations.csv", per_boss)


def _variant_priority(variant_label: str) -> tuple:
    if variant_label.startswith("starcut_n="):
        try:
            return (0, int(variant_label.split("=", 1)[1]))
        except Exception:
            return (0, 9999)
    if variant_label == "circlecut_inner":
        return (1, 0)
    if variant_label == "circlecut_outer":
        return (2, 0)
    return (3, 9999)


def _select_simplest_match(matches: List[Dict[str, object]]) -> Dict[str, object]:
    def key(match: Dict[str, object]) -> tuple:
        variant_label = str(match.get("variant_label", ""))
        x_error = float(match.get("x_error") or 9999.0)
        y_error = float(match.get("y_error") or 9999.0)
        return (_variant_priority(variant_label), x_error + y_error)
    return sorted(matches, key=key)[0]


def write_boss_template_match_csv(
    out_dir: Path,
    per_boss: Dict[object, Dict[str, object]],
    boss_ids: List[object],
) -> None:
    """Write one simplified match row per boss using the simplest matched cut."""
    out_dir.mkdir(parents=True, exist_ok=True)
    
    rows = []
    for boss_id in boss_ids:
        info = per_boss.get(boss_id)
        if not isinstance(info, dict):
            rows.append({
                "boss_id": boss_id,
                "variant_label": "None",
                "template_type": "None",
                "x_cut": "None",
                "y_cut": "None",
                "boss_uv": "None",
                "template_uv": "None",
                "boss_xy": "None",
                "template_xy": "None",
                "x_error": "None",
                "y_error": "None",
                "matched": False,
            })
            continue

        matches = info.get("matches", [])
        if not isinstance(matches, list) or len(matches) == 0:
            rows.append({
                "boss_id": boss_id,
                "variant_label": "None",
                "template_type": "None",
                "x_cut": "None",
                "y_cut": "None",
                "boss_uv": str(info.get("boss_uv")),
                "template_uv": "None",
                "boss_xy": str(info.get("boss_xy")),
                "template_xy": "None",
                "x_error": "None",
                "y_error": "None",
                "matched": False,
            })
            continue

        match = _select_simplest_match(matches)
        rows.append({
            "boss_id": boss_id,
            "variant_label": match.get("variant_label", "None"),
            "template_type": match.get("template_type", "None"),
            "x_cut": match.get("x_cut", "None"),
            "y_cut": match.get("y_cut", "None"),
            "boss_uv": str(info.get("boss_uv")),
            "template_uv": str(match.get("template_uv")),
            "boss_xy": str(info.get("boss_xy")),
            "template_xy": str(match.get("template_xy")),
            "x_error": match.get("x_error", "None"),
            "y_error": match.get("y_error", "None"),
            "matched": bool(match.get("matched", False)),
        })
    
    # Write CSV
    fieldnames = [
        "boss_id",
        "variant_label",
        "template_type",
        "x_cut",
        "y_cut",
        "boss_uv",
        "template_uv",
        "boss_xy",
        "template_xy",
        "x_error",
        "y_error",
        "matched",
    ]
    csv_path = out_dir / "boss_template_match.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"[Step04] Wrote simplified boss-template match table to {csv_path}")
