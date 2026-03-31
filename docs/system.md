# System

This final chapter is intentionally brief. It is for readers who need a quick technical orientation after understanding the software workflow.

## Project structure

```text
.
├── backend/    # FastAPI services and geometry-processing code
├── docs/       # Hosted documentation source
├── electron/   # Electron desktop shell
├── src/        # Next.js frontend and workflow UI
├── scripts/    # Build and helper scripts
└── zdocs/      # Internal notes and draft design material
```

## Architecture overview

The project has three main layers:

1. Electron for the desktop shell
2. Next.js for the user interface
3. FastAPI for processing and analysis services

## Where to look first

- `src/app/workflow/` for the user-facing steps
- `src/components/` for UI and workflow components
- `backend/routers/` for API entry points
- `backend/services/` for analysis and processing logic
