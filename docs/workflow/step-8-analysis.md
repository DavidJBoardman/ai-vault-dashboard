# Step 8: Three-Circle Chord Method Analysis

## Purpose

Apply the **three-circle chord method** to the measured rib geometry to interpret the vault's structural and constructional logic — specifically, whether the ribs were set out using a single shared radius, a pointed two-centre system, or a compound multi-centre profile.

## Background: the three-circle chord method

The three-circle chord method is a classical technique for analysing medieval arch and vault geometry.[^1] It compares three separately fitted arcs — typically the nave arc, the aisle arc, and the transverse arc — and examines the ratios between their radii and chord lengths. The key insight is that medieval builders constrained these relationships geometrically: in many vault types, the three circles share a common chord length or have radii in simple whole-number ratios, revealing the underlying setting-out method even when the vault has settled or deformed.

[^1]: For an account of the three-circle chord method in the context of medieval English vaulting, see [Measurements and Proportions — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/09/designing_medieval_vaults_measurements_proportions/).

## What the application does

Given the arc radii and springing-point positions from Step 7, the backend:

1. Groups the measured ribs into the three analysis roles (configurable by the user).
2. Computes chord lengths and rise-to-span ratios for each group.
3. Compares radius ratios against known construction methods:
   - **Single-centre**: all arcs share approximately the same radius
   - **Three-centre pointed arch**: two outer arcs and a smaller central arc, producing a pointed profile
   - **Multi-centre compound arch**: larger radius variation indicating a more complex setting-out
4. Returns a predicted method label, the three radii (r1, r2, r3), their ratios, and a confidence score.

## What you do here

1. **Assign ribs to roles.** Map the ribs measured in Step 7 to the three circle positions. The default assignment uses the bay layout from the reconstructed plan; adjust if needed.

2. **Run the analysis.** Click **Analyse** to compute the chord-method result.

3. **Review the output.** The results panel shows:
   - The three fitted radii and their ratios
   - The predicted construction method
   - The mean radius and rise-to-span ratio
   - A confidence indicator reflecting how well the data fits the predicted method

4. **Inspect the 3D overlay.** The canvas shows the three fitted arcs positioned in 3D space. Check that the arc centres and profiles look architecturally plausible.

5. **Interpret and record.** Compare the predicted method against any documentary or comparative evidence you have for the vault. Note any ribs with anomalous radii that may have deformed or been repaired.

## Interpreting results

| Predicted method | What it means |
|-----------------|---------------|
| Single-centre | Ribs follow a common radius — the simplest setting-out, consistent with a single turning point |
| Three-centre pointed arch | Classic gothic pointed profile; two outer arcs meet at the apex via a smaller crown arc |
| Multi-centre compound arch | More complex geometry; may indicate a complex design method or post-construction deformation |

High fit error in Step 7 or large radius outliers will reduce the confidence of this analysis. Return to Step 7 to improve arc fits before drawing strong conclusions.

## Interface controls

| Control | What it does |
|---------|-------------|
| Rib-to-role assignment panel | Maps individual ribs to the three analysis positions |
| Analyse button | Runs the chord method computation |
| Results panel | Displays radii, ratios, predicted method, and confidence |
| 3D arc overlay | Shows fitted arcs in the point-cloud canvas |
| Export button | Saves the analysis result to a report file |

## Expected result

A chord-method result that identifies the most likely setting-out method for the vault, with radius ratios and a predicted construction typology that can be compared against historical and architectural evidence.
