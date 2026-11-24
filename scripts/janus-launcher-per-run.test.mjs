import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
if (mode === 'ready') {
  fs.writeSync(1, '__JANUS_URL__ http://127.0.0.1:9/?token=fresh\n');
  setInterval(() => {}, 60_000);
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

  function launch(projectDir, mode) {
    return spawnSync(process.execPath, [launcher, '--no-open', projectDir], {
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${preload}`].filter(Boolean).join(' '),
        JANUS_LAUNCHER_FIXTURE_CLOCK: String(FIXED_STAMP),
        JANUS_LAUNCHER_FIXTURE_MODE: mode,
        JANUS_LAUNCHER_FIXTURE_PID_FILE: pidFile,
      },
    });
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
    expect(existsSync(path.join(serverDir, 'latest.log'))).toBe(false);
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
});
