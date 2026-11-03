import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { workspaceProjectDir } from './index.js';

// Where a discarded workspace folder waits to be deleted. A sibling of the workspace base rather than
// a folder inside it, because every name directly under the base is a valid launch label.
export function workspaceTrashDir(): string {
  return path.join(workspaceProjectDir(), '.janissary', 'workspace-trash');
}

/**
 * Move `dir` out of its name into the trash, so the name is free at once however large the folder
 * is: a rename is one metadata operation, where deleting a clone unlinks every file in it on the
 * event loop. A trash on another filesystem can't be renamed into, so that case deletes in place.
 */
export function discardDirectory(dir: string): void {
  if (!existsSync(dir)) return;
  const trash = workspaceTrashDir();
  mkdirSync(trash, { recursive: true });
  try {
    renameSync(dir, path.join(trash, randomUUID()));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    rmSync(dir, { recursive: true });
  }
}

// Delete everything in the trash without blocking the event loop, including entries an earlier,
// interrupted pass left behind. Never rejects: an entry it can't delete waits for the next pass.
export async function emptyWorkspaceTrash(): Promise<void> {
  const trash = workspaceTrashDir();
  let entries: string[];
  try {
    entries = readdirSync(trash);
  } catch {
    return;
  }
  await Promise.all(entries.map((entry) => deleteQuietly(path.join(trash, entry))));
}

async function deleteQuietly(entry: string): Promise<void> {
  try {
    await rm(entry, { recursive: true, force: true });
  } catch { /* left for the next pass */ }
}
