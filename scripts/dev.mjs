// Run the NestJS backend (watch mode) and the Next.js frontend together.
// Usage: pnpm run dev
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BACKEND_PORT = process.env.PORT ?? '3000';
const FRONTEND_PORT = process.env.FRONTEND_PORT ?? '3001';

// On Windows, npm is npm.cmd; on Unix it is npm.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [];
let shuttingDown = false;

function prefixed(name, stream, chunk) {
  const text = chunk.toString();
  for (const line of text.split('\n')) {
    if (line.length > 0) stream.write(`[${name}] ${line}\n`);
  }
}

function run(name, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => prefixed(name, process.stdout, c));
  child.stderr.on('data', (c) => prefixed(name, process.stderr, c));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${name} exited (code ${code}); shutting down the other process.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(
  `[dev] backend → http://127.0.0.1:${BACKEND_PORT}  |  frontend → http://127.0.0.1:${FRONTEND_PORT}`,
);

run('backend', 'pnpm', ['run', 'start:dev']);
run(
  'frontend',
  'pnpm',
  [
    '--filter',
    'enterprise-ai-agent-frontend',
    'exec',
    'next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    FRONTEND_PORT,
  ],
  { BACKEND_CHAT_URL: `http://127.0.0.1:${BACKEND_PORT}/agent/chat` },
);
