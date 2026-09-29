import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLogSince } from '../bin/read-log-since.mjs';

// Under `--relaunch` the launcher appends to `.janissary/log/server.log`, so the log already holds
// an earlier run's `__JANUS_URL__` line. The launcher has to wait for the line the server it just
// started writes, not report the old address and hide a failed start. Only the failing launch is
// run end to end: a server that starts would outlive the test wherever it cannot be signalled.
const launcher = path.join(import.meta.dirname, '..', 'bin', 'janus.mjs');
const STALE_LINE = '__JANUS_URL__ http://127.0.0.1:1/?token=stale\n';

function runLauncher(home, args) {
  return spawnSync(process.execPath, [launcher, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOME: home },
  });
}

function holdPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('janus launcher under --relaunch', () => {
  let scratch;
  let project;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-relaunch-'));
    project = path.join(scratch, 'work');
    const logDir = path.join(project, '.janissary', 'log');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(path.join(logDir, 'server.log'), STALE_LINE);
  });

  afterEach(() => {
    runLauncher(scratch, ['stop', project]);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('relays a failed start instead of reporting the previous run\'s address', async () => {
    const held = await holdPort();
    try {
      const result = runLauncher(scratch, ['--no-open', '--relaunch', `--port=${held.address().port}`, project]);

      expect(result.stdout).not.toContain('token=stale');
      expect(result.stderr).toContain('failed to start');
      expect(result.stderr).not.toContain('token=stale');
      expect(result.status).toBe(1);
    } finally {
      held.close();
    }
  });
});

describe('readLogSince', () => {
  let scratch;
  let logPath;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-log-since-'));
    logPath = path.join(scratch, 'server.log');
    writeFileSync(logPath, STALE_LINE);
  });

  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it('returns only what was appended after the offset', () => {
    const offset = statSync(logPath).size;
    appendFileSync(logPath, '__JANUS_URL__ http://127.0.0.1:2/?token=fresh\n');

    expect(readLogSince(logPath, offset)).toBe('__JANUS_URL__ http://127.0.0.1:2/?token=fresh\n');
  });

  it('returns nothing when no new output has been written yet', () => {
    expect(readLogSince(logPath, statSync(logPath).size)).toBe('');
  });

  it('returns nothing when the log was truncated below the offset', () => {
    const offset = statSync(logPath).size;
    writeFileSync(logPath, 'x\n');

    expect(readLogSince(logPath, offset)).toBe('');
  });

  it('returns nothing when the log does not exist', () => {
    expect(readLogSince(path.join(scratch, 'missing.log'), 0)).toBe('');
  });
});
