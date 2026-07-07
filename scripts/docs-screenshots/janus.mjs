// Spawns the app server under capture conditions: cwd in the scratch work directory, HOME in
// the scratch home directory, no app window. The server entry is launched directly (not via
// bin/janus.mjs, whose spawnSync child would outlive a kill of the launcher). The printed
// `__JANUS_URL__ <url>` line carries the session token, so capture connects without guessing.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const URL_MARKER = '__JANUS_URL__ ';
const URL_TIMEOUT_MS = 20_000;

function serverCommand(repoRoot) {
  const compiled = path.join(repoRoot, 'dist', 'main.js');
  if (existsSync(compiled)) return [compiled];
  return [path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repoRoot, 'src', 'main.ts')];
}

export function spawnJanus(repoRoot, scratch) {
  const child = spawn(process.execPath, [...serverCommand(repoRoot), '--no-open'], {
    cwd: scratch.work,
    env: { ...process.env, HOME: scratch.home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = new Promise((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => reject(new Error(`no URL from janus within ${URL_TIMEOUT_MS}ms`)), URL_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      buffered += String(chunk);
      const line = buffered.split('\n').find((candidate) => candidate.startsWith(URL_MARKER));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.slice(URL_MARKER.length).trim());
      }
    });
    child.stderr.on('data', () => {});
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`janus exited before printing its URL (code ${code})`));
    });
  });
  return { child, url };
}

export async function killJanus(child) {
  if (child.exitCode !== null) return;
  const gone = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await gone;
  clearTimeout(timer);
}
