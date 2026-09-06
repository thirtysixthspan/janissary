import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { makeToken } from '../security.js';
import { ensureWorkspaceDir, workspacePath } from '../workspace/index.js';

// Scratch-directory allocation for one e2e browser. Split out of `e2e-server.ts` because ownership
// of a directory is its own concern: the browser writes its Chromium profile and its downloads
// there, and closing it deletes the directory recursively, so nothing else may ever be handed the
// same path. The label used to be that path (`workspacePath('<label>.browser')`), which meant a tab
// could already own it and two remote sessions sharing a channel label were handed one directory
// between them. Here the label is decoration and the exclusive create is the ownership.

export type BrowserScratch = {
  // The directory the browser lives in, and its temp sibling, exactly as allocated. The handle
  // keeps both rather than re-deriving them at close time.
  dir: string;
  tempDir: string;
  // Removes exactly the two paths above. Idempotent, and safe when they are already gone.
  remove: () => void;
};

// Every browser scratch directory is a grandchild of the workspace root, inside this one container.
// A tab's own workspace is always `path.join(base, label)` — a direct child — so no label can name a
// browser's directory. The container itself stays a direct child, which is what keeps the startup
// sweep in `clearWorkspaceDir` reaching it without widening what that sweep deletes.
const SCRATCH_CONTAINER = 'browsers';

// A fresh `makeToken()` is 24 random bytes, so a second attempt after `EEXIST` is already beyond
// coincidence. The bound is here so an allocation that cannot succeed fails loudly instead of
// spinning — an unwritable container, say.
const ALLOCATION_ATTEMPTS = 5;

// The label rides along so `ls` says which tab a directory belongs to, and decides nothing else.
// Reducing it to this character set is also what keeps a hostile label (`as ../../thing`, which
// nothing rejects upstream) from steering the allocation: no separator and no `..` component
// survives, so the result cannot leave the container.
function displaySlug(label: string): string {
  const reduced = label.replaceAll(/[^\w.-]/g, '-').replace(/^[.-]+/, '');
  return reduced.slice(0, 32) || 'browser';
}

// `mkdirSync` without `recursive` fails with `EEXIST` rather than adopting what is already there,
// which is the whole point: a directory this launch did not create is never taken over. A pair that
// only half-claimed is rolled back so the next attempt starts clean.
function claim(dir: string, tempDir: string): boolean {
  try {
    mkdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    mkdirSync(tempDir);
    return true;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function removePair(dir: string, tempDir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Allocate a scratch directory and its temp sibling for one browser launch, both empty and both
 * owned by that launch alone. `label` names the tab for a human reading the directory listing; it
 * carries no authority over the path.
 */
export function allocateBrowserScratch(label: string): BrowserScratch {
  ensureWorkspaceDir();
  const container = workspacePath(SCRATCH_CONTAINER);
  mkdirSync(container, { recursive: true });
  const slug = displaySlug(label);
  for (let attempt = 0; attempt < ALLOCATION_ATTEMPTS; attempt++) {
    const dir = path.join(container, `${slug}-${makeToken()}`);
    const tempDir = `${dir}.tmp`;
    if (claim(dir, tempDir)) return { dir, tempDir, remove: () => removePair(dir, tempDir) };
  }
  throw new Error('e2e browser: could not allocate a scratch directory');
}
