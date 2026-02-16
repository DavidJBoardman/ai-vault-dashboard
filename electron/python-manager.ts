import { spawn, ChildProcess } from 'child_process';
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
        
        // Debug: print environment info
        console.log('[Python] ========================================');
        console.log('[Python] PYTHON ENVIRONMENT DETECTION');
        console.log('[Python] ========================================');
        console.log('[Python] PYTHON_PATH env:', process.env.PYTHON_PATH || '(not set)');
        console.log('[Python] CONDA_PREFIX env:', process.env.CONDA_PREFIX || '(not set)');
        console.log('[Python] CONDA_DEFAULT_ENV:', process.env.CONDA_DEFAULT_ENV || '(not set)');
        console.log('[Python] PATH (first 200 chars):', (process.env.PATH || '').substring(0, 200));
        console.log('[Python] ========================================');
        
        if (!fs.existsSync(path.join(backendDir, 'main.py'))) {
          console.warn('Backend not found, skipping Python startup');
          resolve();
          return;
        }

        // Priority order for finding Python:
        // 1. PYTHON_PATH environment variable (for custom setups)
        // 2. Conda environment (if CONDA_PREFIX is set)
        // 3. Well-known conda location for vault-interface env
        // 4. Local venv in backend folder
        // 5. System Python
        
        let foundPython: string | null = null;
        
        // Check for explicit PYTHON_PATH env var
        if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
          foundPython = process.env.PYTHON_PATH;
          console.log('[Python] ✓ Using PYTHON_PATH:', foundPython);
        }
        
        // Check for active conda environment
        if (!foundPython && process.env.CONDA_PREFIX) {
          const condaPython = process.platform === 'win32'
            ? path.join(process.env.CONDA_PREFIX, 'python.exe')
            : path.join(process.env.CONDA_PREFIX, 'bin', 'python');
          
          if (fs.existsSync(condaPython)) {
            foundPython = condaPython;
            console.log('[Python] ✓ Using conda env:', process.env.CONDA_PREFIX);
          } else {
            console.log('[Python] ✗ CONDA_PREFIX set but python not found at:', condaPython);
          }
        }
        
        // Check well-known conda paths for vault-interface env
        if (!foundPython) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '';
          const condaPaths = [
            path.join(homeDir, 'miniconda3', 'envs', 'vault-interface', 'bin', 'python'),
            path.join(homeDir, 'anaconda3', 'envs', 'vault-interface', 'bin', 'python'),
            path.join(homeDir, 'miniforge3', 'envs', 'vault-interface', 'bin', 'python'),
            path.join(homeDir, '.conda', 'envs', 'vault-interface', 'bin', 'python'),
          ];
          
          for (const condaPath of condaPaths) {
            if (fs.existsSync(condaPath)) {
              foundPython = condaPath;
              console.log('[Python] ✓ Found vault-interface conda env at:', condaPath);
              break;
            }
          }
          
          if (!foundPython) {
            console.log('[Python] ✗ No vault-interface conda env found in standard locations');
          }
        }
        
        // Check for local venv
        if (!foundPython) {
          const venvPython = process.platform === 'win32'
            ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
            : path.join(backendDir, 'venv', 'bin', 'python');
          
          if (fs.existsSync(venvPython)) {
            foundPython = venvPython;
            console.log('[Python] ✓ Using local venv');
          }
        }
        
        // Fall back to system Python
        pythonPath = foundPython || 'python';
        if (!foundPython) {
          console.log('[Python] ⚠ Falling back to system python');
        }
        console.log('[Python] Final path:', pythonPath);
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

