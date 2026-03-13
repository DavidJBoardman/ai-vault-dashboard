import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const backendDir = path.join(rootDir, 'backend');
const distDir = path.join(backendDir, 'dist');
const buildDir = path.join(backendDir, 'build');
const targetArgIndex = process.argv.indexOf('--target');
const explicitTarget = targetArgIndex >= 0 ? process.argv[targetArgIndex + 1] : null;
const normalizedTarget = explicitTarget ?? process.platform;
const targetMap = {
  darwin: 'mac',
  mac: 'mac',
  win32: 'win',
  win: 'win',
  linux: 'linux',
};
const target = targetMap[normalizedTarget];

if (!target) {
  console.error(`Unsupported backend target: ${normalizedTarget}`);
  process.exit(1);
}

const currentPlatformTarget = targetMap[process.platform];
if (currentPlatformTarget !== target) {
  console.error(
    `Backend builds must run on the target OS. Current platform=${process.platform}, requested target=${target}.`
  );
  process.exit(1);
}

const executableName = process.platform === 'win32' ? 'vault-backend.exe' : 'vault-backend';
const buildCommands = [
  {
    label: 'uv',
    command: process.platform === 'win32' ? 'uv.exe' : 'uv',
    args: [
      'run',
      '--directory',
      backendDir,
      '--group',
      'build',
      'pyinstaller',
      '--noconfirm',
      '--clean',
      'vault-backend.spec',
    ],
    cwd: rootDir,
  },
];

const pythonCandidates = getPythonCandidates(rootDir, backendDir);
for (const candidate of pythonCandidates) {
  buildCommands.push({
    label: candidate.label,
    command: candidate.command,
    args: ['-m', 'PyInstaller', '--noconfirm', '--clean', 'vault-backend.spec'],
    cwd: backendDir,
  });
}

console.log(`[backend:build] target=${target}`);
console.log(`[backend:build] backendDir=${backendDir}`);

fs.rmSync(buildDir, { recursive: true, force: true });
fs.rmSync(path.join(distDir, executableName), { recursive: true, force: true });

let buildSucceeded = false;

for (const buildCommand of buildCommands) {
  console.log(`[backend:build] attempting ${buildCommand.label}`);
  const result = spawnSync(buildCommand.command, buildCommand.args, {
    cwd: buildCommand.cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
  });

  if (result.error) {
    console.warn(`[backend:build] ${buildCommand.label} unavailable: ${result.error.message}`);
    continue;
  }

  if (result.status === 0) {
    buildSucceeded = true;
    break;
  }

  console.warn(`[backend:build] ${buildCommand.label} exited with status ${result.status}`);
}

if (!buildSucceeded) {
  console.error('[backend:build] No backend build strategy succeeded.');
  process.exit(1);
}

const outputPath = path.join(distDir, executableName);
if (!fs.existsSync(outputPath)) {
  console.error(`[backend:build] Expected executable missing: ${outputPath}`);
  process.exit(1);
}

console.log(`[backend:build] Created ${outputPath}`);

function getPythonCandidates(repoRoot, backendRoot) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (label, command) => {
    if (!command || seen.has(command)) {
      return;
    }
    seen.add(command);
    candidates.push({ label, command });
  };

  if (process.env.PYTHON_PATH) {
    addCandidate('PYTHON_PATH', process.env.PYTHON_PATH);
  }

  const localPythonPaths = process.platform === 'win32'
    ? [
        path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
        path.join(repoRoot, 'venv', 'Scripts', 'python.exe'),
        path.join(backendRoot, '.venv', 'Scripts', 'python.exe'),
        path.join(backendRoot, 'venv', 'Scripts', 'python.exe'),
      ]
    : [
        path.join(repoRoot, '.venv', 'bin', 'python'),
        path.join(repoRoot, 'venv', 'bin', 'python'),
        path.join(backendRoot, '.venv', 'bin', 'python'),
        path.join(backendRoot, 'venv', 'bin', 'python'),
      ];

  for (const localPython of localPythonPaths) {
    if (fs.existsSync(localPython)) {
      addCandidate('local-uv-or-venv', localPython);
    }
  }

  if (process.env.CONDA_PREFIX) {
    const condaPython = process.platform === 'win32'
      ? path.join(process.env.CONDA_PREFIX, 'python.exe')
      : path.join(process.env.CONDA_PREFIX, 'bin', 'python');
    if (fs.existsSync(condaPython)) {
      addCandidate('conda', condaPython);
    }
  }

  addCandidate('python', process.platform === 'win32' ? 'python.exe' : 'python');
  return candidates;
}
