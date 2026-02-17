"""
Vault 2D geometry analysis: ratio-based rule matching with optional geometric ROI re-fit.

Pipeline:
  Step 01 — Interactive ROI selector (drag centre/corners/rotate)
  Step 02 — Prepare boss inputs (mask or points → boss_report.json)
  Step 03 — Optional geometric ROI re-fit (search small ROI parameter offsets)
  Step 04 — Boss-cut ratio matching (single and cross-template)
  Step 05 — Template + bosses overlay
"""

from pathlib import Path

__all__ = []
