from __future__ import annotations

import math
from typing import Dict, Iterable, List, Tuple


def _add_candidate(cands: List[Dict[str, float]], label: str, value: float, target: float) -> None:
    err = abs(value - target)
    rel = err / target if target != 0 else float("inf")
    cands.append({
        "label": label,
        "value": value,
        "err": rel,  # relative error (fraction)
        "err_percentage": rel * 100.0,
    })


def suggest_ratio_patterns(
    target: float,
    *,
    max_denominator: int = 9,
    roots: Iterable[int] = (2, 3, 5, 6, 7, 8, 9),
    include_inverses: bool = True,
    max_results: int = 5,
) -> List[Dict[str, float]]:
    """Suggest simple ratio patterns close to ``target``.

    Returns a list of dictionaries with keys:
      - label: string form of the candidate (e.g., '1/sqrt(2)', '5/7')
      - value: numeric value of the candidate
      - err: relative error (fraction, e.g., 0.0048)
      - err_percentage: relative error in percent
    Sorted by smallest err_percentage.
    Patterns:
      - 1 (square)
      - p/q for 1 <= p,q <= max_denominator
      - sqrt(n) and 1/sqrt(n) for n in ``roots``
    """
    if target <= 0 or math.isinf(target) or math.isnan(target):
        return []

    cands: List[Dict[str, float]] = []

    # Identity
    _add_candidate(cands, "1", 1.0, target)

    # Rationals p/q
    for q in range(1, max_denominator + 1):
        for p in range(1, max_denominator + 1):
            val = p / q
            _add_candidate(cands, f"{p}/{q}", val, target)

    # Root rectangles
    for n in roots:
        r = math.sqrt(float(n))
        _add_candidate(cands, f"sqrt({n})", r, target)
        if include_inverses and r != 0:
            _add_candidate(cands, f"1/sqrt({n})", 1.0 / r, target)

    # Sort and return top results
    cands.sort(key=lambda x: x["err_percentage"])
    # Deduplicate near-equal values by label order
    seen = set()
    out: List[Dict[str, float]] = []
    for cand in cands:
        value = cand["value"]
        key = round(value, 6)
        if key in seen:
            continue
        seen.add(key)
        out.append(cand)
        if len(out) >= max_results:
            break
    return out


