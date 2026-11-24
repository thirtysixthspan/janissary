import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// `bin/janus.mjs` is the launcher every `janus` invocation goes through, and it runs before the
// server parses anything, so a mistyped project directory has to be caught there without the
// launcher first creating state in it. `--no-open` keeps a launcher that wrongly starts a server
// from opening an app window on the host.
const launcher = path.join(import.meta.dirname, '..', 'bin', 'janus.mjs');
const USAGE_HINT = "Try 'janus --help' for more information.";

function launch(...args) {
  return spawnSync(process.execPath, [launcher, '--no-open', ...args], { encoding: 'utf8', timeout: 30_000 });
}

describe('janus launcher project directory', () => {
  let scratch;

  beforeEach(() => { scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-launcher-')); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it('reports a path naming a regular file as a usage error, exits 2, and writes nothing beside it', () => {
    const file = path.join(scratch, 'notes.txt');
    writeFileSync(file, '');

    const result = launch(file);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`invalid project directory: ${file} is not a directory\n${USAGE_HINT}`);
    expect(result.stderr).not.toContain('ENOTDIR');
    expect(readdirSync(scratch)).toEqual(['notes.txt']);
  });

  it('reports a path that does not exist as a usage error, exits 2, and does not create it', () => {
    const missing = path.join(scratch, 'no-such-project');

    const result = launch(missing);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`invalid project directory: ${missing} is not a directory\n${USAGE_HINT}`);
    expect(existsSync(missing)).toBe(false);
  });
});

describe('janus launcher server log location', () => {
  let scratch;

  beforeEach(() => { scratch = mkdtempSync(path.join(os.tmpdir(), 'janus-launcher-')); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it("writes a failed launch's log under .janissary/logs/server and relays its tail", () => {
    const legacy = path.join(scratch, '.janissary', 'logs', 'server.log');
    const sentinel = 'legacy server.log must stay untouched\n';
    mkdirSync(path.dirname(legacy), { recursive: true });
    writeFileSync(legacy, sentinel);

    // An unknown flag makes the server exit 2 before it initializes state, so the launcher's
    // relay of the log tail is the only output and no activity log is created beside it.
    const result = launch('--bogus', scratch);
    const serverDir = path.join(scratch, '.janissary', 'logs', 'server');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--bogus'");
    const logs = readdirSync(serverDir);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^localhost-.*\.log$/);
    expect(readFileSync(path.join(serverDir, logs[0]), 'utf8')).toContain("Unknown option '--bogus'");
    expect(readFileSync(legacy, 'utf8')).toBe(sentinel);
    expect(existsSync(path.join(scratch, '.janissary', 'log', 'server.log'))).toBe(false);
    expect(existsSync(path.join(serverDir, 'latest.log'))).toBe(false);
  });

  it("leaves an existing server.log, an earlier run's log, and latest.log alone on a failed launch", () => {
    const legacy = path.join(scratch, '.janissary', 'logs', 'server.log');
    const serverDir = path.join(scratch, '.janissary', 'logs', 'server');
    mkdirSync(serverDir, { recursive: true });
    const legacySentinel = 'legacy server.log sentinel\n';
    writeFileSync(legacy, legacySentinel);
    const earlierName = 'localhost-2026-11-23T15-04-05-123Z.log';
    const earlier = path.join(serverDir, earlierName);
    const earlierSentinel = `__JANUS_URL__ http://127.0.0.1:1/?token=stale\nprior run sentinel\n`;
    writeFileSync(earlier, earlierSentinel);
    const latest = path.join(serverDir, 'latest.log');
    symlinkSync(earlierName, latest);

    const result = launch('--bogus', scratch);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option '--bogus'");
    expect(result.stderr).not.toContain('warning: could not update');
    expect(readFileSync(legacy, 'utf8')).toBe(legacySentinel);
    expect(readFileSync(earlier, 'utf8')).toBe(earlierSentinel);
    expect(readlinkSync(latest)).toBe(earlierName);
    expect(readFileSync(latest, 'utf8')).toBe(earlierSentinel);
    const logs = readdirSync(serverDir).filter((name) => name !== earlierName && name !== 'latest.log');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^localhost-.*\.log$/);
    expect(readFileSync(path.join(serverDir, logs[0]), 'utf8')).toContain("Unknown option '--bogus'");
  });
});
