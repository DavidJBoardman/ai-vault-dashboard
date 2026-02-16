# Vault Analyser

Medieval Vault Architecture Analysis Platform - A cross-platform desktop application for analyzing 3D point cloud scans of historical vault structures.

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
- Python 3.12+ (via Conda)
- Conda (Miniconda or Anaconda)
- n

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

### 3. Set up Python environment with Conda

Create and activate the conda environment:

```bash
# Create conda environment with Python 3.12
conda create -n vault-interface python=3.12
conda activate vault-interface

# Install PyTorch (required for SAM 3)
# macOS (Apple Silicon - MPS acceleration):
pip install torch torchvision torchaudio

# Linux/Windows with CUDA 12.6:
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126

# Install SAM 3 via HuggingFace Transformers
pip install git+https://github.com/huggingface/transformers torchvision

# Install remaining backend dependencies
pip install -r backend/requirements.txt
```

### 4. Verify SAM 3 installation

```bash
conda activate vault-interface
python -c "from transformers import Sam3Processor, Sam3Model; print('SAM 3 OK')"
```

> **Note**: SAM 3 model weights (~2GB) are downloaded automatically on first use from HuggingFace.

## Development

### Run in development mode

**Important**: Always activate the conda environment before running the backend.

```bash
# Terminal 1: Start the Python backend
conda activate vault-interface
npm run backend:dev

# Terminal 2: Start the Next.js frontend and Electron
npm run dev
```

Or run them separately:

```bash
# Frontend only (opens in browser at localhost:3000)
npm run dev:next

# Backend only (ensure conda env is active)
conda activate vault-interface
cd backend && python -m uvicorn main:app --reload --port 8765
```

### Environment Notes

The Electron app will automatically detect your conda environment. It searches for:

1. `PYTHON_PATH` environment variable
2. Active conda environment (`CONDA_PREFIX`)
3. The `vault-interface` conda environment in standard locations
4. System Python as fallback

## Building for Production

### Build the application

```bash
npm run build
```

### Package for distribution

```bash
# All platforms
npm run package

# Platform-specific
npm run package:win   # Windows (.exe)
npm run package:mac   # macOS (.dmg)
npm run package:linux # Linux (.AppImage)
```

The packaged application will be in the `dist/` directory.

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

## License

MIT
