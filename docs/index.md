# Vault Analyser Documentation

Vault Analyser is a desktop application for turning point-cloud scans of historic vaults into projections, segmentations, geometric reconstructions, and measurement outputs. This site is the user guide for app users working through that workflow.

## Project context

Vault Analyser forms part of the wider project **Virtual Vaults: Using AI to process, analyse and supplement digital data**, and contributes to the broader [Tracing the Past](https://www.tracingthepast.org.uk/) initiative on medieval vault geometry and plan interpretation.

[UKRI project record: UKRI955](https://gtr.ukri.org/projects?ref=UKRI955)

<div class="partner-logos">
  <a href="https://www.ukri.org/" target="_blank" rel="noopener noreferrer">
    <img src="images/logo-ukri.png" alt="UK Research and Innovation logo" class="logo-ukri">
  </a>
  <a href="https://www.liverpool.ac.uk/" target="_blank" rel="noopener noreferrer">
    <img src="images/logo-uol.png" alt="University of Liverpool logo" class="logo-uol">
  </a>
  <a href="https://www.virtualengineeringcentre.com/" target="_blank" rel="noopener noreferrer">
    <img src="images/logo-vec.png" alt="Virtual Engineering Centre logo" class="logo-vec">
  </a>
</div>

## What you can do in the app

- Load an `E57` scan and inspect it in 3D
- Generate 2D projections from multiple viewpoints
- Create segmentation masks for ribs, bosses, and other features
- Reconstruct a 2D bay plan from the segmented vault
- Reproject the interpreted geometry back into 3D
- Extract rib traces and calculate measurements
- Review a final geometric analysis summary

## Recommended reading order

1. [Installation](installation.md)
2. [Before You Start](workflow/pipeline.md)
3. [Step 1 to Step 8](workflow/step-1-upload.md)

If you only need the software workflow, stay inside the `Workflow` section. The `System` page is only for readers who want a light technical orientation.

## Nonstandard methods used in Vault Analyser

- **Gaussian projection rendering**: point clouds are projected into smoother 2D images using Gaussian splatting rather than simple pixel binning, which helps preserve rib visibility in sparse scans. Related reference: Westover, 1990.
- **Prompt-driven segmentation**: the segmentation stage uses **SAM 3**, so users guide the model with polygons, boxes, or text prompts instead of tracing every boundary by hand. Related reference: Ravi et al., 2024 for the Segment Anything family.
- **Template-based bay interpretation**: Step 4 compares detected boss locations against starcut and circlecut-style geometric templates to support historical plan interpretation. Related background: [Tracing the Past](https://www.tracingthepast.org.uk/) material on medieval vault plans.
