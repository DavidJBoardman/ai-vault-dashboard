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
        // In development, run the Python script directly
        pythonPath = 'python';
        args = [
          '-m',
          'uvicorn',
          'main:app',
          '--host',
          '127.0.0.1',
          '--port',
          this.port.toString(),
        ];
        const backendDir = path.join(__dirname, '..', 'backend');
        
        if (!fs.existsSync(path.join(backendDir, 'main.py'))) {
          console.warn('Backend not found, skipping Python startup');
          resolve();
          return;
        }

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

