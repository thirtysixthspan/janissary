#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';

// Janissary runs as a local web app: this launcher boots the Node server (which opens the
// browser to a token-gated localhost URL). `stop`/`--help`/`--version` run attached, printing
// straight to the terminal; every other invocation detaches the server, redirects its output to
// a log file, and returns the shell prompt as soon as the server is ready (or reports failure).
const root = path.join(import.meta.dirname, '..');
const compiled = path.join(root, 'dist', 'main.js');
const source = path.join(root, 'src', 'main.ts');
const localTsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const arguments_ = process.argv.slice(2);

let command, commandArguments;
if (existsSync(compiled)) {
  command = process.execPath;
  commandArguments = [compiled, ...arguments_];
} else if (existsSync(localTsx)) {
  command = process.execPath;
  commandArguments = [localTsx, source, ...arguments_];
} else {
  command = 'npx';
  commandArguments = ['tsx', source, ...arguments_];
}

const isForeground = arguments_[0] === 'stop' || arguments_.includes('--help') || arguments_.includes('--version');

if (isForeground) {
  const result = spawnSync(command, commandArguments, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

// Duplicated from src/main.ts's `__JANUS_URL__` line and scripts/docs-screenshots/janus.mjs's
// `URL_MARKER` — cannot share a constant across the .mjs/.ts boundary.
const URL_MARKER = '__JANUS_URL__ ';
const URL_TIMEOUT_MS = 20_000;
const TAIL_LINES = 200;

// Flag-aware scan for the project directory: skips bare-boolean flags and the `--port` value in
// both `--port=<n>` and `--port <n>` forms. `--port` is the only value-taking flag today
// (src/cli-args.ts) — this scan needs updating if another value-taking flag is added.
function resolveProjectDir(argv) {
  const booleanFlags = new Set(['--help', '--version', '--relaunch', '--no-open']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') { i++; continue; }
    if (arg.startsWith('--port=') || booleanFlags.has(arg)) continue;
    if (arg.startsWith('--')) continue;
    return path.resolve(arg);
  }
  return process.cwd();
}

function tail(text) {
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - TAIL_LINES)).join('\n');
}

// Poll the log file (the child's stdout/stderr are redirected to it, not piped to us) for the
// readiness marker, resolving with the parsed URL. Rejects with `{ type: 'exit', code }` if the
// child exits first, or `{ type: 'timeout' }` if neither happens in time.
function awaitReady(logPath, child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(poll); fn(); };
    const timer = setTimeout(() => finish(() => reject({ type: 'timeout' })), URL_TIMEOUT_MS);
    const poll = setInterval(() => {
      let content = '';
      try { content = readFileSync(logPath, 'utf8'); } catch { /* not created yet */ }
      const line = content.split('\n').find((candidate) => candidate.startsWith(URL_MARKER));
      if (line !== undefined) finish(() => resolve(line.slice(URL_MARKER.length).trim()));
    }, 100);
    child.on('exit', (code) => finish(() => reject({ type: 'exit', code })));
  });
}

const projectDir = resolveProjectDir(arguments_);
const logDir = path.join(projectDir, '.janissary', 'log');
mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'server.log');
const logFd = openSync(logPath, arguments_.includes('--relaunch') ? 'a' : 'w');

const child = spawn(command, commandArguments, { detached: true, stdio: ['ignore', logFd, logFd] });

try {
  const url = await awaitReady(logPath, child);
  child.unref();
  if (arguments_.includes('--no-open')) process.stdout.write(`${url}\n`);
  process.exit(0);
} catch (error) {
  if (error.type === 'exit') {
    process.stderr.write(tail(readFileSync(logPath, 'utf8')));
    process.exit(error.code ?? 1);
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
  process.stderr.write('failed to start: timed out waiting for the server\n');
  process.exit(1);
}
