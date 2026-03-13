# Backend

This backend is a FastAPI service used by the Electron desktop app.

## Dependency Management

- Canonical definition: `pyproject.toml`
- Canonical lockfile: `uv.lock`
- Compatibility only: `requirements.txt`

## Local Development

Preferred:

```bash
uv sync --group build
uv run python -m uvicorn main:app --reload --host 127.0.0.1 --port 8765
```

Supported Conda flow:

```bash
conda create -n vault-interface python=3.12
conda activate vault-interface
pip install -r requirements.txt
pip install pyinstaller==6.10.0
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8765
```

## Packaging

Production packaging uses `uv` and PyInstaller:

```bash
uv sync --group build
uv run pyinstaller --noconfirm --clean vault-backend.spec
```
