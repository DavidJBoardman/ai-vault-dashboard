# Vault Segmentation Application — Feedback & Issue Log

**Review session · May 2026 · Heritage Imaging Team**

---

## Summary By App Step

| App area | Bug | Enhancement | UX / Docs | Testing | Total |
|---|---:|---:|---:|---:|---:|
| Project setup / Global UI | 0 | 1 | 2 | 0 | **3** |
| Step 1 · Upload | 0 | 0 | 0 | 0 | **0** |
| Step 2 · Projection | 0 | 0 | 1 | 0 | **1** |
| Step 3 · Segmentation | 2 | 5 | 0 | 1 | **8** |
| Step 4 · 2D Geometry | 4 | 2 | 1 | 2 | **9** |
| Step 5 · Reprojection | 0 | 0 | 0 | 0 | **0** |
| Step 6 · Traces | 0 | 0 | 0 | 0 | **0** |
| Step 7 · Measurements | 0 | 0 | 0 | 0 | **0** |
| Step 8 · Analysis | 0 | 0 | 0 | 0 | **0** |

---

## Issue Log

Tick each item when fixed by changing `[ ]` to `[x]`. Click an item title to expand its details.

---

## Project Setup / Global UI

<details>
<summary><strong>- [ ] DOC-01 · Missing 'How to start / open project' section before Step 0</strong></summary>

| Field | Detail |
|---|---|
| **Category** | Documentation |
| **Type** | 📄 Docs |
| **Priority** | 🔴 High |
| **Issue** | Documentation jumps directly to Step 0 without onboarding guidance. New users cannot find how to create a new project or open an existing one. |
| **Recommendation** | Add a 'Getting Started' section before Step 0: <br>• **New Project:** File → New Project → set name and save location <br>• **Open Existing:** File → Open → browse to `.proj` file <br>Include screenshots for both flows. |

</details>

<details>
<summary><strong>- [ ] UI-01 · Save button is difficult to locate</strong></summary>

| Field | Detail |
|---|---|
| **Category** | UI / Navigation |
| **Type** | 🖱 UX |
| **Priority** | 🔴 High |
| **Issue** | The Save button is not prominently visible, leading to risk of accidental data loss during sessions. |
| **Recommendation** | Increase Save button prominence with a contrasting colour. Add Ctrl+S keyboard shortcut. Consider an auto-save indicator in the status bar. |

</details>

---

## Step 1 · Upload

No issues logged.

---

## Step 2 · Projection

<details>
<summary><strong>- [ ] DOC-02 · Terminology mismatch: 'Generate Projection' (doc) vs 'Add Projection' (app)</strong></summary>

| Field | Detail |
|---|---|
| **Category** | Documentation |
| **Type** | 📄 Docs |
| **Priority** | 🟡 Medium |
| **Issue** | The documentation uses 'Generate Projection' but the app button reads 'Add Projection'. This inconsistency confuses users following the documentation step-by-step. |
| **Recommendation** | Audit all button labels against documentation. Standardise on 'Generate Projection' (more descriptive). Update whichever source differs and add a consistency check to the release process. |

</details>

---

## Step 3 · Segmentation

<details>
<summary><strong>- [ ] SEG-01 · No Redo function — accidentally deleted rib cannot be recovered</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | Deleting a rib during segmentation is irreversible — there is no Undo/Redo. Users must restart segmentation from scratch. |
| **Recommendation** | Implement Undo / Redo stack (Ctrl+Z / Ctrl+Y) for all segmentation operations. Minimum 10-step history recommended. Add Undo/Redo buttons to the segmentation toolbar. |

</details>

<details>
<summary><strong>- [ ] SEG-02 · Rib and Boss Stone should be pre-selected as defaults</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | ✨ Enhancement |
| **Priority** | 🟡 Medium |
| **Issue** | Users must manually select Rib and Boss Stone targets each session. These are the most common targets and should default to selected. |
| **Recommendation** | Set Rib and Boss Stone as pre-selected defaults on entering 2D Segmentation. Allow users to deselect if needed. Persist user preferences across sessions. |

</details>

<details>
<summary><strong>- [ ] SEG-03 · No contextual feedback during segmentation loading</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | ✨ Enhancement |
| **Priority** | 🟡 Medium |
| **Issue** | 'This may take a minute for large images' provides no context-specific status. Users cannot tell what the system is searching for or whether their selection is valid. |
| **Recommendation** | Add dynamic status messages: <br>• 'Searching for similar rib structures…' <br>• 'Searching for boss stone features…' <br>• ⚠️ Warning: 'No region selected — please draw a bounding box' <br>• ⚠️ Warning: 'Nothing matched in selected region' |

</details>

<details>
<summary><strong>- [ ] BUG-01 · Rib segmentation disappears after generating a new Boss</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | After generating a Boss segmentation, previously completed Rib segmentation masks are lost. Forces users to redo Rib segmentation — significant rework on large images. |
| **Recommendation** | Investigate mask layer management — Boss and Rib masks must be stored in separate layers/channels. Generating one label should never overwrite another. Add regression test: generate Rib → generate Boss → verify Rib mask persists. |

</details>

<details>
<summary><strong>- [ ] UI-02 · Label colour and transparency are not adjustable</strong></summary>

| Field | Detail |
|---|---|
| **Category** | UI / Visualisation |
| **Type** | ✨ Enhancement |
| **Priority** | 🟡 Medium |
| **Issue** | Users cannot change colour or transparency of segmentation labels. Overlapping masks are hard to distinguish. |
| **Recommendation** | Add a label style panel: colour picker + opacity slider per label. Implement 'highlight mode': selected mask at full opacity, others faded. Save label style preferences per project. |

</details>

<details>
<summary><strong>- [ ] SEG-04 · No Cancel option during active segmentation</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | ✨ Enhancement |
| **Priority** | 🟡 Medium |
| **Issue** | Once segmentation starts there is no way to abort mid-process. Users must wait for completion before correcting a wrong selection. |
| **Recommendation** | Add a Cancel button alongside the loading spinner during segmentation. Cancelling should abort cleanly without corrupting existing masks. Show confirmation: 'Segmentation cancelled. Previous masks preserved.' |

</details>

<details>
<summary><strong>- [ ] WF-01 · Auto-run Rib and Boss segmentation on entering 2D Geometry</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Segmentation |
| **Type** | ✨ Enhancement |
| **Priority** | 🟢 Low |
| **Issue** | Users must manually trigger segmentation after entering 2D Geometry. A default first-pass run would reduce friction and improve onboarding. |
| **Recommendation** | On entering 2D Geometry, automatically run segmentation with Rib + Boss Stone as defaults. Display results immediately; user can adjust and re-run. Provide a 'Skip auto-run' setting for advanced users. |

</details>

---

## Step 4 · 2D Geometry

<details>
<summary><strong>- [x] BUG-01 · Bug when overlaying rib segmentation mask in 2D Geometry view</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Geometry |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | Bay Plan: Overlaying the rib segmentation mask in 2D Geometry produces unexpected rendering errors. Exact trigger conditions TBC — observed during testing. |
| **Recommendation** | Reproduce consistently and capture error output. Check z-ordering and blend modes for mask overlay layers. Verify mask coordinate transforms are consistent between 2D Segmentation and 2D Geometry. |

</details>

<details>
<summary><strong>- [x] GEO-01 · Topology view needs two versions of boss locations</strong></summary>

| Field | Detail |
|---|---|
| **Category** | Topology / 2D Geometry |
| **Type** | ✨ Enhancement |
| **Priority** | 🟡 Medium |
| **Issue** | Topology currently shows a single boss location view. Users need both idealised/schematic positions AND real measured positions from scan data. |
| **Recommendation** | Add a toggle or dual-panel in Topology view: <br>• **'Schematic'** — idealised vault geometry positions <br>• **'Measured'** — actual boss locations from segmentation data <br>Allow overlay comparison with adjustable transparency. |

</details>

<details>
<summary><strong>- [x] GEO-02 · Cut typology calculation behaves unexpectedly (Lincoln C8)</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Geometry |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | On Lincoln C8, the cut typology classification produces results that don't match expectations. The current logic is hard to follow and the output is not intuitive to interpret. |
| **Recommendation** | Double-check the cut typology logic against Lincoln C8 as a reference case. Investigate whether classification rules can be expressed more intuitively (e.g. clearer geometric criteria, visual diagnostics overlaid on the cut diagram). Surface intermediate values so users can see why a given typology was assigned. |

</details>

<details>
<summary><strong>- [x] GEO-03 · Bay plan should prioritise measured boss locations over idealised template positions</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Geometry |
| **Type** | ✨ Enhancement |
| **Priority** | 🔴 High |
| **Issue** | Bay-plan reconstruction currently prefers idealised template positions from Step 4C when a match exists. For scan-derived geometry, measured boss/reference locations should remain the primary node geometry; idealised positions should support interpretation, comparison, or optional regularisation rather than silently replacing measured locations. |
| **Recommendation** | Change reconstruction node precedence so Step 4D uses measured/reference boss locations by default. Keep idealised/template positions as an overlay or explicit optional mode, and provide fit diagnostics showing measured vs idealised positions, residuals, and any nodes affected by regularisation. |

</details>

<details>
<summary><strong>- [x] UI-03 · 'No match' notification should appear under the preview</strong></summary>

| Field | Detail |
|---|---|
| **Category** | UI / 2D Geometry |
| **Type** | 🖱 UX |
| **Priority** | 🟡 Medium |
| **Issue** | The 'no match' notification currently appears away from the preview area, so users don't immediately associate the message with what they're looking at. |
| **Recommendation** | Move the 'no match' notification directly under the preview panel so feedback sits next to the visual it refers to. Keep styling consistent with other inline warnings (e.g. amber banner with icon). |

</details>

<details>
<summary><strong>- [x] GEO-04 · Step 4D reconstruction and DXF export are not to real-world scale</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Geometry |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | The Step 4D bay-plan reconstruction and the exported DXF used raw projection **pixel** coordinates, so the drawing carried no metric meaning in CAD. |
| **Resolution** | Backend now derives metres-per-pixel from the projection metadata (`max(range_x, range_y) / (resolution × 0.9)`, mirroring the projection renderer) and includes `metresPerPixel` in the reconstruction result. The DXF export scales node coordinates to **metres** and sets `$INSUNITS = 6`; the reconstruction panel shows the active scale (and falls back to pixel coordinates with a clear note when projection metadata is unavailable). New util `backend/services/geometry2d/utils/scale.py` with unit tests. |

</details>

<details>
<summary><strong>- [x] BUG-02 · Manual rib deletion in Step 4D could not be reverted</strong></summary>

| Field | Detail |
|---|---|
| **Category** | 2D Geometry |
| **Type** | 🐛 Bug |
| **Priority** | 🔴 High |
| **Issue** | In the Manual edit tab, deleting a rib was irreversible. There was no undo/redo, and 'Reset edits' only restored the last *saved* state — so once a deletion was saved, the original rib could only be recovered by re-running the whole reconstruction. |
| **Resolution** | Added an undo/redo stack over the draft rib edits and made 'Reset edits' restore the original reconstruction, keyed on the run's `ranAt` so it survives manual-edge saves. Deletes are now reversible both before saving (Undo) and after saving (Reset edits). |

</details>

---

## Step 5 · Reprojection

No issues logged.

---

## Step 6 · Traces

No issues logged.

---

## Step 7 · Measurements

No issues logged.

---

## Step 8 · Analysis

No issues logged.

---

## Recommended Testing Cases

| Done | ID | Site | Vault / Bay | Reference / DOI | Testing Focus |
|---|---|---|---|---|---|
| [ ] | TC-01 | Lincoln Cathedral | C7, C8, C9 | [doi.org/10.5284/1084971](https://doi.org/10.5284/1084971) (S3.4 & N3.4) | Step 4 · 2D Geometry validation on known vault geometry |
| [ ] | TC-02 | Wells Cathedral | S3-4, 7th cut | — | Step 3 · Rib segmentation and Step 2 · projection accuracy |
| [ ] | TC-03 | Ely Cathedral, Lady Chapel | Lc3 | — | Step 4 · 2D Geometry on complex plan geometry |

---

## Notes

- **Priority:** High = resolve before next release; Medium = next sprint; Low = backlog.
- **BUG-01** and **BUG-02** (mask layer management and 2D Geometry overlay) are blocking field testing.
- **DOC-02** terminology audit should be a joint documentation/development review session.
- Test cases reference open archaeological datasets — coordinate with Lincoln and Wells/Ely teams for access.
- Lincoln dataset available at [doi.org/10.5284/1084971](https://doi.org/10.5284/1084971).

---

*Confidential — Internal Use Only · Heritage Imaging Team*
