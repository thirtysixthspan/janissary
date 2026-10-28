import path from 'node:path';
import { parentPath } from './index.js';
import { listingFor } from './filesystem-cache.js';
import type { FilesTabState } from './state.js';

// Shared pieces of the `files` command's view restore (see `restore-command.ts`). Everything here is
// best effort and silent — a path that no longer resolves is dropped, exactly as `pruneCachedRows`
// drops a vanished expanded directory on every rebuild.
//
// Every read goes through the tab's own filesystem port and its listing cache, so a navigator on a
// remote machine is judged against that machine's tree, never against the local disk at the same
// relative path.

// The surviving selection, handed to the client on the tab's payload. `revision` changes only when
// a new restore is applied, so the repeated full-state broadcasts never re-apply an old hint over
// a selection the user has since changed.
let nextRevision = 1;

// Whether a requested expanded path should be expanded again. A local tree's port lists synchronously,
// so the parent's listing answers at once. A remote tree's may still be loading; the path is then
// expanded on trust, and the rebuild that listing's arrival triggers prunes it if it has gone.
export function stillDirectory(state: FilesTabState, relPath: string, onReady: () => void): boolean {
  if (relPath === '') return true;
  const listing = listingFor(state, parentPath(relPath), onReady);
  if (listing === undefined) return true;
  const name = path.posix.basename(relPath);
  return listing.some((entry) => entry.name === name && entry.dir);
}

export function nextRestoreRevision(): number {
  return nextRevision++;
}
