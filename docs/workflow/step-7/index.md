# Step 7: Measurements and Analysis

## Purpose

This step turns the traced rib curves from Step 6 into a structured measurement dataset. It works in two linked sub-stages: first you organise and label the ribs, bosses, and pairings that define how the vault should be interpreted; then you review the calculated geometric values that will feed the final analytical summary in Step 8.

Where Step 6 establishes the geometry of the intrados lines, Step 7 establishes their **meaning**: which traces belong together, which bosses they connect to, which ribs should be treated as symmetrical pairs, and which measurements can therefore be compared.

## Sub-stages

Step 7 is divided into two sequential sub-stages, labelled **7A–7B** in the interface:

| Sub-stage | Name | Key action |
|-----------|------|------------|
| **7A** | [Labelling](labelling.md) | Name ribs and boss stones, organise rib groups, define pairings, and set the impost line |
| **7B** | [Data](data.md) | Review the calculated rib and boss measurements, inspect diagnostics, and export the results |

The workflow is intentionally ordered: **configuration in 7A unlocks interpretation in 7B**. You cannot move to the data review tab until the labelling stage has been completed.

## Key concepts

**Trace source**
:   The rib curves used by Step 7. These come from Step 6 and can be taken from the automatic traces, imported manual traces, or both.

**Rib group**
:   A single rib or a set of trace segments treated as one structural rib for naming and measurement.

**Boss stone**
:   A named rib junction or keystone marker used to identify rib ends and to support apex calculations.

**Rib pairing**
:   A user-defined or automatically suggested pairing of two symmetrical ribs or rib groups. Pairings are used to estimate apex heights.

**Impost line**
:   The springing reference height against which apex height and impost distance are measured.

## What happens in this step

Step 7 combines several calculations behind the scenes:

1. It loads the selected trace source from Step 6 and the boss markers already associated with the project.
2. It estimates rib groups and allows you to refine them manually.
3. It fits circular arcs to the rib traces and derives lengths, radii, springing data, and fit errors.
4. It calculates impost-based heights and span values once the rib naming and pairing logic is defined.
5. It saves a Step 7B summary snapshot for Step 8 when you continue to the next workflow step.


## Expected result

Before moving on to Step 8 you should have:

- a reviewed set of rib names and boss-stone names
- any necessary rib groups and symmetric pairings defined
- an impost line mode that gives plausible height values
- a checked measurement summary for ribs and bosses
- exported CSV files if you need an external record of the results
