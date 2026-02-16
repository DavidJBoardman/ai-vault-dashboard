import { spawn, ChildProcess, execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export class PythonManager {
  private process: ChildProcess | null = null;
  private port: number = 8765;
  private running: boolean = false;

  constructor(port?: number) {
    if (port) this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const isDev = process.env.NODE_ENV !== 'production';
      let pythonPath: string;
      let args: string[];

      if (isDev) {
        // In development, run the Python script
        const backendDir = path.join(__dirname, '..', 'backend');

        // Debug: print environment info (keep compact and platform-neutral)
        console.log('[Python] ========================================');
        console.log('[Python] PYTHON ENVIRONMENT DETECTION');
        console.log('[Python] ========================================');
        console.log('[Python] NODE_ENV:', process.env.NODE_ENV || '(not set)');
        console.log('[Python] Platform:', process.platform);
        console.log('[Python] PYTHON_PATH env:', process.env.PYTHON_PATH || '(not set)');
        console.log('[Python] CONDA_PREFIX env:', process.env.CONDA_PREFIX || '(not set)');
        console.log('[Python] Using repo-local venv candidates: .venv / venv (repo root and backend/)');
        console.log('[Python] ========================================');

        if (!fs.existsSync(path.join(backendDir, 'main.py'))) {
          console.warn('Backend not found, skipping Python startup');
          resolve();
          return;
        }

        // Python resolution order (dev):
        // 1) PYTHON_PATH env (explicit override)
        // 2) repo-local venv (.venv preferred; also support venv), including backend-local venvs
        // 3) active conda env (CONDA_PREFIX) for colleague compatibility
        // 4) pyenv-managed Python (pyenv which python)
        // 5) system fallback: python

        let foundPython: string | null = null;
        let foundBy: string | null = null;

        // Helper to check candidates in order
        const pickFirstExisting = (candidates: string[]): string | null => {
          for (const p of candidates) {
            if (p && fs.existsSync(p)) return p;
          }
          return null;
        };

        // 1) Explicit override
        if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
          foundPython = process.env.PYTHON_PATH;
          foundBy = 'PYTHON_PATH';
        }

        // Resolve repo root based on backendDir
        const repoRoot = path.resolve(backendDir, '..');

        // 2) Local venvs (repo root first; then backend-local)
        if (!foundPython) {
          const venvCandidates: string[] = [];

          // repo-root .venv / venv
          if (process.platform === 'win32') {
            venvCandidates.push(
              path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
              path.join(repoRoot, 'venv', 'Scripts', 'python.exe'),
              path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
              path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
            );
          } else {
            venvCandidates.push(
              path.join(repoRoot, '.venv', 'bin', 'python'),
              path.join(repoRoot, 'venv', 'bin', 'python'),
              path.join(backendDir, '.venv', 'bin', 'python'),
              path.join(backendDir, 'venv', 'bin', 'python'),
            );
          }

          const picked = pickFirstExisting(venvCandidates);
          if (picked) {
            foundPython = picked;
            foundBy = 'local-venv';
          }
        }

        // 3) Active conda env (compat)
        if (!foundPython && process.env.CONDA_PREFIX) {
          const condaPython = process.platform === 'win32'
            ? path.join(process.env.CONDA_PREFIX, 'python.exe')
            : path.join(process.env.CONDA_PREFIX, 'bin', 'python');

          if (fs.existsSync(condaPython)) {
            foundPython = condaPython;
            foundBy = 'conda';
          }
        }

        // 4) pyenv (best-effort; only if available)
        if (!foundPython) {
          try {
            const pyenvPython = execFileSync('pyenv', ['which', 'python'], {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
            }).trim();

            if (pyenvPython && fs.existsSync(pyenvPython)) {
              foundPython = pyenvPython;
              foundBy = 'pyenv';
            }
          } catch (e) {
            // pyenv not installed or not on PATH; ignore
          }
        }

        // 5) System fallback
        pythonPath = foundPython || 'python';

        if (foundBy) {
          console.log(`[Python] ✓ Using ${foundBy}:`, pythonPath);
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

        this.process = spawn(pythonPath, args, {
          cwd: backendDir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        // In production, run the bundled executable
        const resourcesPath = process.resourcesPath || app.getAppPath();
        const executableName = process.platform === 'win32' ? 'vault-backend.exe' : 'vault-backend';
        pythonPath = path.join(resourcesPath, 'backend', executableName);

        if (!fs.existsSync(pythonPath)) {
          console.warn('Backend executable not found at:', pythonPath);
          resolve();
          return;
        }

        this.process = spawn(pythonPath, ['--port', this.port.toString()], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }

      if (!this.process) {
        resolve();
        return;
      }

      this.process.stdout?.on('data', (data) => {
        console.log(`[Python] ${data}`);
        if (data.toString().includes('Application startup complete') || 
            data.toString().includes('Uvicorn running')) {
          this.running = true;
          resolve();
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[Python Error] ${data}`);
        // Uvicorn logs startup info to stderr
        if (data.toString().includes('Application startup complete') ||
            data.toString().includes('Uvicorn running')) {
          this.running = true;
          resolve();
        }
      });

      this.process.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        reject(error);
      });

      this.process.on('exit', (code) => {
        console.log(`Python process exited with code ${code}`);
        this.running = false;
        this.process = null;
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.running) {
          console.warn('Python backend startup timeout, continuing anyway');
          resolve();
        }
      }, 30000);
    });
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

