import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findRepoRoot } from './workspace.js';

// Assumes os.tmpdir() (== $TMPDIR) has no .git ancestor. True on a normal host, but false inside
// a sandboxed workspace: sandbox.ts overrides TMPDIR to a path nested inside the parent repo's
// own git tree (see sandbox-profile.ts), so the walk-up finds the parent repo's .git instead of
// running off the end of the filesystem. Kept out of `npm test` / `npm run check` for that reason
// — run via `npm run test:unsandboxed` on the host.
describe('findRepoRoot', () => {
  it('returns undefined when no .git is found', () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'workspace-test-'));
    expect(findRepoRoot(tmpDir)).toBeUndefined();
  });
});
