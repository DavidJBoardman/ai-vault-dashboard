from __future__ import annotations

import math
from typing import Dict, Iterable, List


def _add_candidate(cands: List[Dict[str, float]], label: str, value: float, target: float) -> None:
    err = abs(value - target)
    rel = err / target if target != 0 else float("inf")
    cands.append(
        {
            "label": label,
            "value": value,
            "err": rel,
            "err_percentage": rel * 100.0,
        }
    )


def suggest_ratio_patterns(
    target: float,
    *,
    max_denominator: int = 9,
    roots: Iterable[int] = (2, 3, 5, 6, 7, 8, 9),
    include_inverses: bool = True,
    max_results: int = 5,
) -> List[Dict[str, float]]:
    """Suggest simple ratio patterns close to target."""
    if target <= 0 or math.isinf(target) or math.isnan(target):
        return []

    cands: List[Dict[str, float]] = []
    _add_candidate(cands, "1", 1.0, target)

    for q in range(1, max_denominator + 1):
        for p in range(1, max_denominator + 1):
            _add_candidate(cands, f"{p}/{q}", p / q, target)

    for n in roots:
        r = math.sqrt(float(n))
        _add_candidate(cands, f"sqrt({n})", r, target)
        if include_inverses and r != 0:
            _add_candidate(cands, f"1/sqrt({n})", 1.0 / r, target)

    cands.sort(key=lambda x: x["err_percentage"])
    seen = set()
    out: List[Dict[str, float]] = []
    for cand in cands:
        key = round(cand["value"], 6)
        if key in seen:
            continue
        seen.add(key)
        out.append(cand)
        if len(out) >= max_results:
            break
    return out

