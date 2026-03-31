# Step 4: 2D Geometry Analysis

## Purpose

This step performs the main 2D geometric interpretation of the segmented vault data.

## Internal sequence inside this step

The application breaks this stage into four sub-stages:

1. ROI and bay proportion
2. Reference points
3. Cut-typology matching
4. Bay-plan reconstruction

## What you do here

- define and save the ROI
- prepare or confirm reference points
- run typology matching
- inspect reconstructed bay-plan results

![Geometry 2D workflow](../../images/step-4/geometry-2d-workflow.png)

## Why this step matters

This is the most interpretation-heavy part of the workflow. The outputs created here feed directly into the 3D reprojection and downstream analysis steps.

## Expected result

Before moving on, you should have:

- a saved ROI analysis
- reference points where required
- a completed matching or reconstruction result that the next step can use
