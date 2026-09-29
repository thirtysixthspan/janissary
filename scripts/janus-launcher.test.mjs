import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
