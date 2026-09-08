import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptPath } from './script-path.mjs';

// This test file sits in the same directory as the scripts, so it can say where the answer ought to
// land without depending on the working directory the runner happens to have.
const scriptsDir = import.meta.dirname;

describe('scriptPath', () => {
  it('names a script that lives beside it', () => {
    const resolved = scriptPath('lint-files.mjs');
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(existsSync(resolved)).toBe(true);
  });

  // The whole point: a task prompt runs the scripts through `$janissary/scripts/run.mjs`, so the
  // working directory belongs to the project being worked on and may hold no `scripts/` at all.
  // Asserted by running from a directory that certainly is not a janissary checkout, rather than by
  // reading the implementation — a `path.resolve` against cwd would satisfy the test above too.
  it('answers the same from a working directory with no scripts/ of its own', () => {
    const original = process.cwd();
    process.chdir(os.tmpdir());
    try {
      expect(scriptPath('lint-files.mjs')).toBe(path.join(scriptsDir, 'lint-files.mjs'));
    } finally {
      process.chdir(original);
    }
  });
});
