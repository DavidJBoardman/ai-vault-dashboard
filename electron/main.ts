import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { PythonManager } from './python-manager';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let pythonManager: PythonManager | null = null;
let staticServer: http.Server | null = null;
let staticServerUrl: string | null = null;

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function ensureStaticServer(): Promise<string> {
  if (staticServerUrl) {
    return staticServerUrl;
  }

  const outDir = path.join(app.getAppPath(), 'out');

  if (!fs.existsSync(outDir)) {
    throw new Error(`Exported frontend not found at: ${outDir}`);
  }

  staticServer = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalizedPath = pathname === '/' ? '/index.html' : pathname;
    const relativePath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');

    const candidates = [
      path.join(outDir, safePath),
      path.join(outDir, safePath, 'index.html'),
    ];
    const filePath = candidates.find((candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });

    const resolvedPath = filePath ?? path.join(outDir, '404.html');
    const ext = path.extname(resolvedPath).toLowerCase();

    res.writeHead(filePath ? 200 : 404, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });

    fs.createReadStream(resolvedPath).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    staticServer?.once('error', reject);
    staticServer?.listen(0, '127.0.0.1', () => resolve());
  });

  const address = staticServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Static server failed to bind to a local port.');
  }

  staticServerUrl = `http://127.0.0.1:${address.port}`;
  return staticServerUrl;
}

function createWindow() {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f172a',
    show: false,
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    if (!staticServerUrl) {
      throw new Error('Static server URL is not available for production startup.');
    }
    mainWindow.loadURL(staticServerUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startPythonBackend() {
  pythonManager = new PythonManager();
  try {
    await pythonManager.start();
    console.log('Python backend started successfully');
  } catch (error) {
    console.error('Failed to start Python backend:', error);
    dialog.showErrorBox(
      'Backend Error',
      'Failed to start the Python backend. Some features may not work.'
    );
  }
}

app.whenReady().then(async () => {
  if (!isDev) {
    await ensureStaticServer();
  }

  await startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  staticServer?.close();
  staticServer = null;
  staticServerUrl = null;
  pythonManager?.stop();
});

// IPC Handlers for file operations
ipcMain.handle('dialog:openFile', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'E57 Files', extensions: ['e57'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: options?.filters || [
      { name: 'E57 Files', extensions: ['e57'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result;
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return result;
});

ipcMain.handle('app:getPath', (_, name: string) => {
  return app.getPath(name as any);
});

ipcMain.handle('python:getPort', () => {
  return pythonManager?.getPort() || 8765;
});

ipcMain.handle('python:isRunning', () => {
  return pythonManager?.isRunning() || false;
});

ipcMain.handle('capture:region', async (_, rect: { x: number; y: number; width: number; height: number }) => {
  if (!mainWindow) {
    throw new Error('Main window is not available');
  }

  const bounds = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };

  const image = await mainWindow.webContents.capturePage(bounds);
  return image.toPNG().toString('base64');
});
