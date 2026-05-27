2d Geometry
[Done] Suggested ROI - change the content on pop up alert window. currently it is n located inside roi, change it to xxxxx is completed, it is not garanteed that xxx, use xxxx, to the right bottom corner maybe?
[Done] Suggested ROI - add Beta label
[Done] OVerlay ribs, boss stone not working on "Bay Plan"

Cut-Typology fidelity to Tracing the Past (Hill)
~~[] Verify starcut diagonals are in the candidate set.~~ RESOLVED — NO GAP (2026-05-27). Diagonals in Hill's starcut are *construction lines* used to locate proportional points (1/3, 1/5, …); bosses sit on the resulting grid crossings, which is exactly what `_grid_intersections` matches. Mixed denominators within one bay are already covered: under the family-level "starcut" reading, `pickAxisCutForReading` selects any `starcut_n=k` per boss/per axis, so one bay can have bosses on 1/3 and 1/4 simultaneously. Only caveat: a denominator must be within the enabled `starcutMin..starcutMax` range (default 6) — raise the max for finer subdivisions.
[x] Tie inner-circle and outer-circle family rank. DONE (commit cfba40c) — `_variant_priority` and frontend `matchPriority` return the same tuple for both circle variants; `_axis_cut_priority` drops the variant-label tiebreak so error decides ties; `_variant_summary_rank_key` gives both equal complexity.
~~[] Express tolerance in source-drawing units (metres on the original bay), not normalised.~~ DECIDED AGAINST (2026-05-27). Setting-out error scales with bay size — a larger bay was struck with a longer rope and carries larger absolute drift — so a proportional (fraction-of-bay) tolerance models the original geometry more faithfully than a fixed mm. For the single-bay, tune-by-eye workflow the units are cosmetic (same matches either way), and metre-tolerance would add a projection-scale dependency + per-axis plumbing for no change in outcome. Keep the normalised tolerance.
~~[] Anomaly-aware reading summary.~~ DECIDED AGAINST (2026-05-27). Purely presentational stitching of data the UI already exposes: matched/total badge + "N unmatched" badge + composition bar chart + the filterable match table (sort to Unmatched to find the outlier and its nearest candidate). A generated sentence would duplicate existing affordances and add per-boss "nearest non-matching candidate" logic for a single-bay workflow that reads the canvas + table directly. Keep the existing chips/table.

Cut-Typology UX (Step 4C interface)
[] Simplify the Step 4C panel so tuning advanced parameters → rerun matching is a one-click flow. Current state: advanced parameters, run button, overlay toggles, reading selector and match table are spread out. Goal: a single tuning surface where the user nudges tolerance / starcut range / family toggles and sees the recomputed reading immediately, without scrolling between sections.
[] Add grid hover on the canvas: hovering a template cell or cut line should highlight the contributing bosses (and vice versa — hovering a boss should highlight the cut line / cell it sits on). Bridges the table evidence and the visual evidence.
[] Better organise the cut-typology overlay list: collapse by family (starcut / circlecut inner / circlecut outer), default-open the recommended reading's family, show n alongside each entry, and surface the per-variant matched count inline so the user doesn't have to open the modal table.

Others
[Done] Rename app to Vault Analyser
[Done] Project saved locations 
    * dev, stay together with the backend/data
    * build, 
      * - macOS: `/Users/<you>/Vault Analyser/`
      * - Windows: `C:\Users\<you>\Vault Analyser\`
    * fixed on building, but need to discuss if this is okay
[Done] logo 
[x] UKRI logo on documentation
[x] UKRI logo on app
[] Collect users info before they download the install files
~~[] Change the red colour~~
~~[?] app icon~~

# David

Add docs page to readme file - david check github for it

Remove other names from box tool select menu - david

Switch lettering positions to match nicks guide in segmentation - david

3d reprojection - move generate preview button inside preview settings menu - david

take a look at the segmentation overlaps and multiple rib selections in a single mask - david

Remove Analysis page - David

# Yang

[x] 2d geometry - load segmentation labels for boss stone points (abc lettering) - yang

[x] remove depth and plasma from ui viewer all pages - yang

[x] Add warning when navigating to cut typology saying to make sure all boss stones are labelled because they're used in future steps - yang

[x] add logo  ukri or whatever - yang
[x] removed setting buttons on the top right corner

[x] analysis-report

[x] dxf [vector format] to export the plan

[x] Cut-Typology hoverover the reference point, the user cares more about the xcut, ycut, how could we highlight that without overwhelming the context. currently, it shows too many content

[x] Cut-Typology move the unmatched notification, to the bottom of PReview?

# Wiktoria

Bug with auto label in measurements - Wiktoria

Measurements page fix ui cutoff on groupings - wiktoria

Analysis page, show a quick summary of the vault results 2d + 3d anaylsis with csv downloads (analysis completed, heres a summary etc...) - ???

Build
~~[?] Add NSIS installer if required.Need a vote.~~
[x] Add uninstall doc