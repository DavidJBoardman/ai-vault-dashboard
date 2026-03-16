from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_dir = Path(SPECPATH)
hiddenimports = [
    "pye57",
    "open3d",
    "uvicorn",
    "fastapi",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "torchvision",
    "torchvision.io",
    "torchvision.ops",
    "torchvision.ops.boxes",
    "torchvision.transforms",
]
hiddenimports += collect_submodules("transformers.models.sam3")
excludes = [
    # Optional visualisation/data-science stacks pulled in around open3d are not
    # used by the packaged backend runtime and add substantial PyInstaller cost.
    "dash",
    "plotly",
    "matplotlib",
    "matplotlib_inline",
    "pandas",
    "sklearn",
]


a = Analysis(
    ["main.py"],
    pathex=[str(project_dir)],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    module_collection_mode={
        "transformers": "py",
    },
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="vault-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="vault-backend",
)
