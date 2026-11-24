import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serverLogFilename } from '../bin/server-log.mjs';

const repoBin = path.join(import.meta.dirname, '..', 'bin');
const FIXED_STAMP = Date.UTC(2026, 10, 23, 15, 4, 5, 123);
const STALE_URL = 'http://127.0.0.1:1/?token=stale';
const FRESH_URL = 'http://127.0.0.1:9/?token=fresh';
const FAILURE = 'fake server failed before readiness\n';
const LEGACY_SENTINEL = 'legacy server.log sentinel\n';
const PRIOR_SENTINEL = 'prior run sentinel\n';
const STALE_LINE = `__JANUS_URL__ ${STALE_URL}\n`;

// The copied launcher prefers `dist/main.js` in its own root, so this fake server replaces a built
// app and a web bundle. It writes to fd 1, which the launcher points at this run's new log.
const FAKE_SERVER = String.raw`
const fs = require('node:fs');
const mode = process.env.JANUS_LAUNCHER_FIXTURE_MODE;
fs.writeFileSync(process.env.JANUS_LAUNCHER_FIXTURE_PID_FILE, String(process.pid));
const ready = () => {
  fs.writeSync(1, '__JANUS_URL__ http://127.0.0.1:9/?token=fresh\n');
  setInterval(() => {}, 60_000);
};
if (mode === 'ready') {
  ready();
} else if (mode === 'gated-ready') {
  const gate = process.env.JANUS_LAUNCHER_FIXTURE_GATE;
  const wait = () => {
    if (!fs.existsSync(gate)) return setTimeout(wait, 50);
    ready();
  };
  wait();
} else {
  fs.writeSync(1, 'fake server failed before readiness\n');
  process.exit(7);
}
`;
const CLOCK_PRELOAD = 'Date.now = () => Number(process.env.JANUS_LAUNCHER_FIXTURE_CLOCK);\n';

describe('janus launcher per-run server log', () => {
  let scratch;
  let launcher;
  let preload;
  let pidFile;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-launcher-per-run-'));
    writeFileSync(path.join(scratch, 'package.json'), '{"type": "commonjs"}');
    const bin = path.join(scratch, 'bin');
    const dist = path.join(scratch, 'dist');
    mkdirSync(bin, { recursive: true });
    mkdirSync(dist, { recursive: true });
    for (const name of ['janus.mjs', 'server-log.mjs', 'read-log-since.mjs']) {
      copyFileSync(path.join(repoBin, name), path.join(bin, name));
    }
    launcher = path.join(bin, 'janus.mjs');
    writeFileSync(path.join(dist, 'main.js'), FAKE_SERVER);
    preload = path.join(scratch, 'clock.cjs');
    writeFileSync(preload, CLOCK_PRELOAD);
    pidFile = path.join(scratch, 'fake-server.pid');
  });

  afterEach(() => {
    try {
      const pid = Number(readFileSync(pidFile, 'utf8').trim());
      if (pid > 0) process.kill(-pid, 'SIGKILL');
    } catch { /* already exited */ }
    rmSync(scratch, { recursive: true, force: true });
  });

  function makeProject(name) {
    const projectDir = path.join(scratch, name);
    const configDir = path.join(projectDir, '.janissary');
    const logsDir = path.join(configDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), '{"logEnabled": false}');
    const legacy = path.join(logsDir, 'server.log');
    writeFileSync(legacy, LEGACY_SENTINEL);
    const serverDir = path.join(logsDir, 'server');
    mkdirSync(serverDir, { recursive: true });
    const prior = path.join(serverDir, serverLogFilename(FIXED_STAMP));
    writeFileSync(prior, STALE_LINE + PRIOR_SENTINEL);
    return { projectDir, serverDir, legacy, prior };
  }

  function launchEnv(mode, gate) {
    return {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${preload}`].filter(Boolean).join(' '),
      JANUS_LAUNCHER_FIXTURE_CLOCK: String(FIXED_STAMP),
      JANUS_LAUNCHER_FIXTURE_MODE: mode,
      JANUS_LAUNCHER_FIXTURE_PID_FILE: pidFile,
      JANUS_LAUNCHER_FIXTURE_GATE: gate,
    };
  }

  function launch(projectDir, mode) {
    return spawnSync(process.execPath, [launcher, '--no-open', projectDir], {
      encoding: 'utf8',
      timeout: 30_000,
      env: launchEnv(mode),
    });
  }

  function launchAsync(projectDir, mode, gate) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [launcher, '--no-open', projectDir], { env: launchEnv(mode, gate) });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (status) => resolve({ status, stdout, stderr }));
    });
  }

  async function waitForPid() {
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        if (readFileSync(pidFile, 'utf8').trim()) return;
      } catch { /* not written yet */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('fake server never wrote its pid file');
  }

  it('uses its own readiness marker after a filename collision and prints it under --no-open', () => {
    const { projectDir, serverDir, legacy, prior } = makeProject('ready');

    const result = launch(projectDir, 'ready');

    const fresh = path.join(serverDir, serverLogFilename(FIXED_STAMP + 1));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${FRESH_URL}\n`);
    expect(readFileSync(fresh, 'utf8')).toBe(`__JANUS_URL__ ${FRESH_URL}\n`);
    expect(readFileSync(legacy, 'utf8')).toBe(LEGACY_SENTINEL);
    expect(readFileSync(prior, 'utf8')).toBe(STALE_LINE + PRIOR_SENTINEL);
    expect(readlinkSync(path.join(serverDir, 'latest.log'))).toBe(path.basename(fresh));
  });

  it('relays only its own pre-readiness failure and preserves the child exit code', () => {
    const { projectDir, serverDir, legacy, prior } = makeProject('exit');

    const result = launch(projectDir, 'exit');

    const fresh = path.join(serverDir, serverLogFilename(FIXED_STAMP + 1));
    expect(result.status).toBe(7);
    expect(result.stderr).toContain(FAILURE.trim());
    expect(result.stderr).not.toContain(STALE_URL);
    expect(readFileSync(fresh, 'utf8')).toBe(FAILURE);
    expect(readFileSync(legacy, 'utf8')).toBe(LEGACY_SENTINEL);
    expect(readFileSync(prior, 'utf8')).toBe(STALE_LINE + PRIOR_SENTINEL);
  });

  it('keeps latest.log on the earlier run until the new server prints its readiness marker', async () => {
    const { projectDir, serverDir, prior } = makeProject('gated');
    const gate = path.join(scratch, 'gate');
    const latest = path.join(serverDir, 'latest.log');
    symlinkSync(path.basename(prior), latest);

    const running = launchAsync(projectDir, 'gated-ready', gate);
    await waitForPid();

    expect(readlinkSync(latest)).toBe(path.basename(prior));

    writeFileSync(gate, '');
    const result = await running;

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${FRESH_URL}\n`);
    expect(result.stderr).toBe('');
    expect(readlinkSync(latest)).toBe(serverLogFilename(FIXED_STAMP + 1));
  });

  it('warns once and still succeeds when latest.log is a regular file', () => {
    const { projectDir, serverDir } = makeProject('warn');
    const latest = path.join(serverDir, 'latest.log');
    const sentinel = 'latest.log is a regular file\n';
    writeFileSync(latest, sentinel);

    const result = launch(projectDir, 'ready');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${FRESH_URL}\n`);
    expect(result.stderr).toBe(`warning: could not update ${latest}: not a symbolic link\n`);
    expect(readFileSync(latest, 'utf8')).toBe(sentinel);
    expect(readdirSync(serverDir).filter((name) => name.startsWith('latest.log.'))).toEqual([]);
  });
});
