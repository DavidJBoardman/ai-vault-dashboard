# Step 8: Three-Circle Chord Method Analysis

## Purpose

Review a final **three-circle chord method** style summary based on the measured rib geometry. This step is best used as an interpretive aid rather than a standalone conclusion.

## Background: the three-circle chord method

The three-circle chord method is a classical way to compare fitted arcs in medieval vault and arch studies.[^1] The idea is to compare a small number of key radii and spans to see whether the geometry behaves like a simple shared-radius system, a pointed multi-centre system, or something more irregular.

[^1]: For an account of the three-circle chord method in the context of medieval English vaulting, see [Measurements and Proportions — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/09/designing_medieval_vaults_measurements_proportions/).

## What the application does

Given the arc radii and springing-point positions from Step 7, the backend:

1. Takes the measured rib geometry from Step 7.
2. Compares a small set of fitted radii and derived values.
3. Reports a predicted method label and summary metrics.

## What you do here

1. Run the analysis.
2. Review the predicted method label, radii, and confidence.
3. Treat the result as one line of evidence alongside your own historical and geometric interpretation.

## Interpreting results

| Predicted method | What it means |
|-----------------|---------------|
| Single-centre | The measured ribs behave as though they share a similar radius |
| Three-centre pointed arch | The result looks more like a pointed multi-centre geometry |
| Multi-centre compound arch | The radii vary enough to suggest a more complex or less regular construction |

High fit error in Step 7 or strong outliers should make you cautious. If necessary, return to Step 7 before drawing strong conclusions.

## Interface controls

| Control | What it does |
|---------|-------------|
| Rib-to-role assignment panel | Maps individual ribs to the three analysis positions |
| Analyse button | Runs the chord method computation |
| Results panel | Displays radii, ratios, predicted method, and confidence |
| 3D arc overlay | Shows fitted arcs in the point-cloud canvas |
| Export button | Saves the analysis result to a report file |

## Expected result

A final summary result that can be compared against historical and architectural evidence.
