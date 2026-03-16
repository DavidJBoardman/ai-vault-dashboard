import { spawn, ChildProcess, execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

type PythonCandidate = {
  path: string;
  source: string;
};

export class PythonManager {
  private process: ChildProcess | null = null;
  private port: number = 8765;
  private running: boolean = false;

  constructor(port?: number) {
    if (port) this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let startupTimeout: NodeJS.Timeout | null = null;
      const stderrBuffer: string[] = [];
      const stdoutBuffer: string[] = [];
      const maxBufferedLines = 50;
      const startupTimeoutMs = app.isPackaged ? 120000 : 30000;
      const markStarted = () => {
        if (settled) return;
        settled = true;
        this.running = true;
        if (startupTimeout) clearTimeout(startupTimeout);
        resolve();
      };
      const failStart = (error: Error) => {
        if (settled) return;
        settled = true;
        this.running = false;
        if (startupTimeout) clearTimeout(startupTimeout);
        reject(error);
      };

      const isDev = !app.isPackaged;
      let pythonPath: string;
      let args: string[];
      const backendDir = path.join(__dirname, '..', 'backend');
      const repoRoot = path.resolve(backendDir, '..');

      if (isDev) {
        // Debug: print environment info (keep compact and platform-neutral)
        console.log('[Python] ========================================');
        console.log('[Python] PYTHON ENVIRONMENT DETECTION');
        console.log('[Python] ========================================');
        console.log('[Python] NODE_ENV:', process.env.NODE_ENV || '(not set)');
        console.log('[Python] Platform:', process.platform);
        console.log('[Python] PYTHON_PATH env:', process.env.PYTHON_PATH || '(not set)');
        console.log('[Python] CONDA_PREFIX env:', process.env.CONDA_PREFIX || '(not set)');
        console.log('[Python] Using uv/venv/conda candidates from repo root and backend/');
        console.log('[Python] ========================================');

        if (!fs.existsSync(path.join(backendDir, 'main.py'))) {
          console.warn('Backend not found, skipping Python startup');
          resolve();
          return;
        }

        // Python resolution order (dev):
        // 1) PYTHON_PATH env (explicit override)
        // 2) repo-local uv/venv environments
        // 3) active conda env (compat)
        // 4) pyenv-managed Python (pyenv which python)
        // 5) system fallback: python
        const foundCandidate = this.resolveDevelopmentPython(repoRoot, backendDir);
        pythonPath = foundCandidate?.path || (process.platform === 'win32' ? 'python.exe' : 'python');

        if (foundCandidate) {
          console.log(`[Python] ✓ Using ${foundCandidate.source}:`, pythonPath);
        } else {
          console.log('[Python] ⚠ Falling back to system python:', pythonPath);
        }

        console.log('[Python] Backend cwd:', backendDir);
        console.log('[Python] ========================================');
        args = [
          '-m',
          'uvicorn',
          'main:app',
          '--host',
          '127.0.0.1',
          '--port',
          this.port.toString(),
        ];

        // Force UTF-8 and unbuffered output
        // Fixes encoding issues in the terminal when logs print emojis or characters like "✓" and "✗"
        const env = {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',  // ← Force UTF-8
          PYTHONUNBUFFERED: '1',       // ← Force unbuffered output
        };

        this.process = spawn(pythonPath, args, {
          cwd: backendDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: env,
        });
      } else {
        // In production, run the bundled executable
        const resourcesPath = process.resourcesPath || app.getAppPath();
        const executableName = process.platform === 'win32' ? 'vault-backend.exe' : 'vault-backend';
        const dataRoot = path.join(app.getPath('home'), 'Vault Analyser');
        const backendCwd = dataRoot;
        pythonPath = path.join(resourcesPath, 'backend', executableName);

        if (!fs.existsSync(pythonPath)) {
          failStart(new Error(`Bundled backend executable not found at: ${pythonPath}`));
          return;
        }

        fs.mkdirSync(dataRoot, { recursive: true });

        this.process = spawn(pythonPath, ['--port', this.port.toString()], {
          cwd: backendCwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            VAULT_ANALYSER_DATA_ROOT: dataRoot,
          },
        });
      }

      if (!this.process) {
        resolve();
        return;
      }

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        stdoutBuffer.push(text.trim());
        if (stdoutBuffer.length > maxBufferedLines) stdoutBuffer.shift();
        console.log(`[Python] ${text}`);
        if (data.toString().includes('Application startup complete') || 
            data.toString().includes('Uvicorn running')) {
          markStarted();
        }
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        stderrBuffer.push(text.trim());
        if (stderrBuffer.length > maxBufferedLines) stderrBuffer.shift();
        console.error(`[Python Error] ${text}`);
        // Uvicorn logs startup info to stderr
        if (data.toString().includes('Application startup complete') ||
            data.toString().includes('Uvicorn running')) {
          markStarted();
        }
      });

      this.process.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        failStart(error);
      });

      this.process.on('exit', (code) => {
        console.log(`Python process exited with code ${code}`);
        const exitedDuringStartup = !settled && !this.running;
        this.running = false;
        this.process = null;
        if (exitedDuringStartup) {
          const recentStderr = stderrBuffer.filter(Boolean).slice(-10).join('\n');
          const recentStdout = stdoutBuffer.filter(Boolean).slice(-10).join('\n');
          const recentLogs = [recentStderr, recentStdout].filter(Boolean).join('\n');
          failStart(
            new Error(
              `Python backend exited before startup (code ${code ?? 'null'}).` +
                (recentLogs ? ` Recent logs:\n${recentLogs}` : '')
            )
          );
        }
      });

      // Packaged PyInstaller one-file startup can take much longer due to extraction.
      startupTimeout = setTimeout(() => {
        if (!this.running) {
          const recentStderr = stderrBuffer.filter(Boolean).slice(-10).join('\n');
          const recentStdout = stdoutBuffer.filter(Boolean).slice(-10).join('\n');
          const recentLogs = [recentStderr, recentStdout].filter(Boolean).join('\n');
          failStart(
            new Error(
              `Python backend startup timed out after ${startupTimeoutMs / 1000} seconds.` +
                (recentLogs ? ` Recent logs:\n${recentLogs}` : '')
            )
          );
        }
      }, startupTimeoutMs);
    });
  }

  private resolveDevelopmentPython(repoRoot: string, backendDir: string): PythonCandidate | null {
    const explicitPython = process.env.PYTHON_PATH;
    if (explicitPython && fs.existsSync(explicitPython)) {
      return { path: explicitPython, source: 'PYTHON_PATH' };
    }

    const venvCandidates = this.getLocalPythonCandidates(repoRoot, backendDir);
    const localPython = this.pickFirstExisting(venvCandidates);
    if (localPython) {
      return { path: localPython, source: 'local-uv-or-venv' };
    }

    const condaPython = this.getCondaPython();
    if (condaPython) {
      return { path: condaPython, source: 'conda' };
    }

    const pyenvPython = this.getPyenvPython();
    if (pyenvPython) {
      return { path: pyenvPython, source: 'pyenv' };
    }

    return null;
  }

  private getLocalPythonCandidates(repoRoot: string, backendDir: string): string[] {
    if (process.platform === 'win32') {
      return [
        path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
        path.join(repoRoot, 'venv', 'Scripts', 'python.exe'),
        path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
        path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
      ];
    }

    return [
      path.join(repoRoot, '.venv', 'bin', 'python'),
      path.join(repoRoot, 'venv', 'bin', 'python'),
      path.join(backendDir, '.venv', 'bin', 'python'),
      path.join(backendDir, 'venv', 'bin', 'python'),
    ];
  }

  private getCondaPython(): string | null {
    if (!process.env.CONDA_PREFIX) {
      return null;
    }

    const condaPython = process.platform === 'win32'
      ? path.join(process.env.CONDA_PREFIX, 'python.exe')
      : path.join(process.env.CONDA_PREFIX, 'bin', 'python');

    return fs.existsSync(condaPython) ? condaPython : null;
  }

  private getPyenvPython(): string | null {
    try {
      const pyenvPython = execFileSync('pyenv', ['which', 'python'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();

      return pyenvPython && fs.existsSync(pyenvPython) ? pyenvPython : null;
    } catch {
      return null;
    }
  }

  private pickFirstExisting(candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.running = false;
    }
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.running;
  }
}
