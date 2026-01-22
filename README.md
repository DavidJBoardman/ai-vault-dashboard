# Vault Analyzer

Medieval Vault Architecture Analysis Platform - A cross-platform desktop application for analyzing 3D point cloud scans of historical vault structures.

## Features

- **E57 Point Cloud Import**: Load and visualize 3D laser scan data
- **3D to 2D Projection**: Generate scaled orthographic projections from multiple perspectives
- **SAM3 Segmentation**: AI-powered segmentation of vault ribs and architectural features
- **Geometry Analysis**: Classify vault construction methods (starcut, circlecut, star-circlecut)
- **3D Reprojection**: Map 2D annotations back to 3D with E57 export
- **Intrados Line Detection**: Automatic skeleton extraction along vault ribs
- **Measurement Tools**: Calculate arc radius, rib length, apex and springing points
- **Three-Circle Chord Method**: Analyze geometric construction techniques

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
│  │ Processor│  │ Segment  │  │   Analyzer   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+ 
- Python 3.10+
- npm or yarn

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/ai-vault-interface.git
cd ai-vault-interface
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install Python backend dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Download SAM Model (Optional)

For full segmentation functionality, download the SAM model weights:

```bash
# Download from https://github.com/facebookresearch/segment-anything
# Place sam_vit_h_4b8939.pth in the backend/ directory
```

## Development

### Run in development mode

Start both the frontend and backend:

```bash
# Terminal 1: Start the Python backend
npm run backend:dev

# Terminal 2: Start the Next.js frontend and Electron
npm run dev
```

Or run them separately:

```bash
# Frontend only (opens in browser at localhost:3000)
npm run dev:next

# Backend only
cd backend && python -m uvicorn main:app --reload --port 8765
```

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
- Python 3.10+
- FastAPI
- pye57
- Open3D
- Segment Anything (SAM)
- NumPy/SciPy

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

