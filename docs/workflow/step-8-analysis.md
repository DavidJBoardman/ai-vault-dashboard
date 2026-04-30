# Step 8: Analysis

## Purpose

Step 8 is the **workflow results summary**. It does not introduce new geometry operations; it gathers the outputs from earlier steps so you can review, export, and archive the project before returning to the home screen.

Use this step as a final check before downloading outputs or closing the workflow.

The screen is organised into two tabs that mirror how the vault pipeline splits between plan-based work and intrados measurement work:

| Tab | Focus | Principal inputs |
|-----|--------|-------------------|
| **2D** | Projection-based geometry and typology | Step 4 outputs, selected projection, cut-typology table |
| **3D** | Rib and boss measurements from traces | Saved Step 7B summary under the project measurements folder |

## 2D summary

The **2D** tab presents a single scrollable geometry report for the current project and selected projection. It brings together the main Step 4 outcomes in a readable form:

- project and projection metadata
- bay-plan reconstruction, including nodes and rib segments
- bay-proportion results and candidate labels
- cut-typology matches from the live table data
- a generation timestamp for the report view

If no project is loaded, the page explains that a project must be opened before the summary can be shown.

## 3D measurement summary

The **3D** tab loads the saved Step 7B measurement summary for the current project. This is the persisted snapshot written when you continue from Step 7 towards Step 8.

The data summary includes metric cards for rib rows, grouped rows, boss stones, average arc radius, average fit error, and averaged rib measurements where numeric values are available. It also includes:

- a rib summary table with names, sources, rib counts, arc radius, length, impost distance, span, apex height, and fit error
- a boss stone table with boss names, groups, height from impost, connected ribs, apex pairs, and source
- expandable long tables so the page remains readable

Values appear as `n/a` where the underlying measurement is missing or not applicable. If the Step 7B summary has not been saved, return to Step 7 and continue through the data stage before refreshing Step 8.

## Exports

The **2D** tab provides **Download Bundle (.zip)**. The archive is built in the browser and includes the report data needed for an external record:

| File | Description |
|------|-------------|
| `report.html` | Self-contained HTML copy of the 2D report |
| `bay-proportion.csv` | Ranked bay-proportion candidates |
| `cut-typology.csv` | Cut-typology results using the same columns as the application table |
| `bay-plan.png` | Optional image export of the reconstructed bay plan |
| `bay-plan.dxf` and metadata | Optional CAD export of reconstructed rib segments and nodes |

Optional files are included when the required data and rendering steps are available. The bundle still downloads if an optional image or CAD export cannot be produced.

The **3D** tab provides separate CSV exports:

| Button | Export |
|--------|--------|
| **Download Ribs CSV** | Rib measurements, including radius, length, impost distance, span, apex height, and fit error |
| **Download Boss CSV** | Boss stone names and height-from-impost values |

Download the exports after you have finished editing Step 4 geometry and Step 7 measurement labels, so the archive reflects the final project state.

## Workflow actions

Use **Back to Measurements** if you need to change labels or data in Step 7. Use **Complete & Return Home** when you are satisfied; this marks Step 8 complete and returns you to the home screen.

## Expected result

Before completing the workflow you should have:

- reviewed the 2D report against the final Step 4 geometry
- checked the 3D rib and boss measurement summary from Step 7B
- downloaded any required report bundle or CSV files
- confirmed that no labels, pairings, or measurement settings need further adjustment
