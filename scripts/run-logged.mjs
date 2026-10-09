import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';

const [logFile, command, ...args] = process.argv.slice(2);
if (!logFile || !command) {
  console.error('Usage: node scripts/run-logged.mjs <log file> <command> [args...]');
  process.exit(2);
}
mkdirSync(path.dirname(logFile), { recursive: true });
const log = createWriteStream(logFile, { flags: 'a' });
const child = spawn(command, args, {
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  log.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  log.end();
  process.exit(code ?? 0);
});
