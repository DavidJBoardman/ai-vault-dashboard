import { spawnSync } from 'node:child_process';

const host = process.env.BACKEND_HOST ?? '127.0.0.1';
const port = process.env.BACKEND_PORT ?? '8765';

const commands = [
  {
    label: 'uv',
    command: process.platform === 'win32' ? 'uv.exe' : 'uv',
    args: [
      'run',
      '--directory',
      'backend',
      'python',
      '-m',
      'uvicorn',
      'main:app',
      '--reload',
      '--host',
      host,
      '--port',
      port,
    ],
  },
  {
    label: 'python',
    command: process.platform === 'win32' ? 'python.exe' : 'python',
    args: ['-m', 'uvicorn', 'main:app', '--reload', '--host', host, '--port', port],
    cwd: 'backend',
  },
];

for (const candidate of commands) {
  const result = spawnSync(candidate.command, candidate.args, {
    cwd: candidate.cwd ?? process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }
}

console.error('Unable to start backend. Install uv or activate a Conda/Python environment first.');
process.exit(1);
