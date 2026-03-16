# Vault Analyser

Medieval Vault Architecture Analysis Platform - A cross-platform desktop application for analyzing 3D point cloud scans of historical vault structures.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Project Structure](#project-structure)
- [Workflow Steps](#workflow-steps)
- [Technologies](#technologies)
- [Build and Release](#build-and-release)
- [License](#license)

## Features

- **E57 Point Cloud Import**: Load and visualize 3D laser scan data
- **3D to 2D Projection**: Generate scaled orthographic projections from multiple perspectives
- **SAM3 Segmentation**: AI-powered segmentation of vault ribs and architectural features
- **Geometry Analysis**: Classify vault construction methods (starcut, circlecut, star-circlecut)
- **3D Reprojection**: Map 2D annotations back to 3D with E57 export
- **Intrados Line Detection**: Automatic skeleton extraction along vault ribs
- **Measurement Tools**: Calculate arc radius, rib length, apex and springing points
- **Three-Circle Chord Method**: Analyse geometric construction techniques

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
│  ┌────────────────────────────────────────────┐ │
│  │              Next.js Frontend               │ │
│  │  ┌────────────┐  ┌──────────────────────┐  │ │
│  │  │   React    │  │   Three.js Viewer    │  │ │
│  │  │ Components │  │   (Point Cloud)      │  │ │
│  │  └────────────┘  └──────────────────────┘  │ │
│  │  ┌────────────────────────────────────────┐│ │
│  │  │         Zustand State Store           ││ │
│  │  └────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────┘ │
│                      ↕ IPC                       │
└─────────────────────────────────────────────────┘
                       ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────┐
│              Python Backend (FastAPI)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   E57    │  │   SAM3   │  │   Geometry   │  │
│  │ Processor│  │ Segment  │  │   Analyser   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 22+
- Python 3.12+
- `uv` for the preferred backend workflow
- Conda (optional, supported for local development compatibility)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/ai-vault-dashboard.git
cd ai-vault-dashboard
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Set up the backend environment

`uv` is the canonical dependency and packaging workflow for this repo. Conda remains supported for local development.

#### Preferred: uv

```bash
uv sync --directory backend --extra build
```

#### Supported: Conda

```bash
conda create -n vault-interface python=3.12
conda activate vault-interface
pip install -r backend/requirements.txt
pip install pyinstaller==6.10.0
```

### 4. Verify backend dependencies

```bash
uv run --directory backend python -c "from transformers import Sam3Processor, Sam3Model; print('SAM 3 OK')"
```

Or, if you are using Conda:

```bash
conda activate vault-interface
python -c "from transformers import Sam3Processor, Sam3Model; print('SAM 3 OK')"
```

> **Note**: SAM 3 model weights (~2GB) are downloaded automatically on first use from HuggingFace.

## Development

### Run in development mode

The backend always runs on `127.0.0.1:8765` in development. Electron will try development interpreters in this order:

1. `PYTHON_PATH`
2. repo-local `uv` / virtualenv interpreters
3. active Conda environment
4. `pyenv`
5. system `python`

#### Full desktop dev loop

```bash
npm run dev
```

#### Backend only

With `uv`:

```bash
npm run backend:dev:uv
```

With Conda:

```bash
conda activate vault-interface
npm run backend:dev
```

#### Frontend only

```bash
npm run dev:next
```

### Environment Notes

Official packaging and CI use `uv`, even though local development supports both `uv` and Conda.

## Project Structure

```
ai-vault-interface/
├── electron/              # Electron main process
│   ├── main.ts           # App entry point
│   ├── preload.ts        # IPC bridge
│   └── python-manager.ts # Python subprocess manager
├── src/                   # Next.js frontend
│   ├── app/              # App router pages
│   │   └── workflow/     # Step pages (1-8)
│   ├── components/       # React components
│   │   ├── ui/          # shadcn/ui components
│   │   ├── point-cloud/ # 3D viewer
│   │   └── workflow/    # Step navigation
│   └── lib/             # Utilities and store
├── backend/              # Python processing
│   ├── main.py          # FastAPI app
│   ├── routers/         # API endpoints
│   └── services/        # Business logic
└── package.json
```

## Workflow Steps

1. **Upload E57 Scan** - Import 3D point cloud data
2. **3D to 2D Projection** - Generate orthographic views
3. **Segmentation** - SAM3-based feature detection
4. **2D Geometry Analysis** - Vault classification
5. **Reprojection to 3D** - Map annotations back
6. **3D Geometry Description** - Intrados line handling
7. **Measurements** - Arc fitting and calculations
8. **Chord Method Analysis** - Construction technique prediction

## Technologies

### Frontend

- Electron
- Next.js 14
- React
- Three.js / React Three Fiber
- TailwindCSS
- shadcn/ui
- Zustand

### Backend

- Python 3.12+ (via Conda)
- FastAPI
- Open3D
- SAM 3 (Segment Anything Model 3 via HuggingFace Transformers)
- PyTorch (with MPS support for macOS)
- NumPy/SciPy

## Build and Release

### Local development

Use this loop when you are changing code and running the app from source:

```bash
npm install
uv sync --directory backend --extra build
npm run dev
```

The development backend stores runtime data under `backend/data/`.

### Local packaged build

```bash
# Clean previously generated files from building
npm run clean

# Build a local packaged macOS app
npm run package:mac:app

# Run the packaged app
open "dist/mac-arm64/Vault Analyser.app"
```

If you specifically want the fuller packaging path, including DMG creation:

```bash
npm run clean
npm run package:mac
```

Notes:

- `npm run clean` removes generated build folders but keeps `node_modules` and `backend/.venv`.
- Local packaged builds are unsigned. Gatekeeper warnings are expected on other Macs until signing/notarization is added.
- The packaged app saves its working data under the user home folder:
- macOS: `/Users/<you>/Vault Analyser/`
- Windows: `C:\Users\<you>\Vault Analyser\`

### GitHub build trigger

GitHub Actions is the current artifact build path for unsigned test releases.

The workflow is defined in [`.github/workflows/desktop-release.yml`](/Users/yangzhang/Documents/Bitbucket/AI-Vaults-2025/ai-vault-dashboard/.github/workflows/desktop-release.yml) and can be triggered in two ways:

1. Manually from the `Actions` tab using `Desktop Release` and `Run workflow`
2. Automatically by pushing a Git tag that matches `v*`

Current workflow outputs:

- macOS: `dist/mac*/Vault Analyser.app`
- Windows: `dist/*.exe` and `dist/win-unpacked/`

For the current unsigned internal-build setup, no extra GitHub configuration is required beyond the existing workflow. Apple signing and notarization secrets are only needed later if you decide to distribute signed macOS builds.

### Replacing the version and tagging a build

Before creating a release tag, update the software version in the source:

- [`package.json`](./package.json)
- [`src/app/page.tsx`](./src/app/page.tsx)
- [`backend/main.py`](./backend/main.py)

Then commit and push a matching tag:

```bash
git add package.json package-lock.json src/app/page.tsx backend/main.py
git commit -m "Release v0.1.0"

# Only if the tag already exists locally/remotely
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0

git tag v0.1.0
git push origin main --tags
```

That tag push will trigger the GitHub desktop build workflow.

## License

MIT
