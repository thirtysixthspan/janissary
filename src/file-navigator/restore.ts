import path from 'node:path';
import { parentPath } from './index.js';
import { buildCachedRows, listingFor } from './filesystem-cache.js';
import { expandAndWatch, type NavPort } from './navigation.js';
import type { FilesTabState } from './state.js';

// Replays a tree view saved by `profile save` onto a freshly opened navigator: the expanded
// directories go back into server state, and the cursor/anchor/selection become a hint the client
// applies once. Everything here is best effort and silent — a saved path that no longer resolves
// is dropped, exactly as `pruneCachedRows` drops a vanished expanded directory on every rebuild.
//
// Every read goes through the tab's own filesystem port and its listing cache, so a navigator on a
// remote machine is judged against that machine's tree, never against the local disk at the same
// relative path.

// A navigator's view as authored in (or captured into) a profile's `files` entry. Every path is
// relative to the tree's root.
export type SavedTreeView = {
  expanded?: string[];
  cursor?: string;
  anchor?: string;
  selected?: string[];
};

// The surviving selection, handed to the client on the tab's payload. `revision` changes only when
// a new restore is applied, so the repeated full-state broadcasts never re-apply an old hint over
// a selection the user has since changed.
export type TreeRestoreHint = {
  revision: number;
  cursor?: string;
  anchor?: string;
  selected: string[];
};

let nextRevision = 1;

// Whether a saved expanded path should be expanded again. A local tree's port lists synchronously,
// so the parent's listing answers at once. A remote tree's may still be loading; the path is then
// expanded on trust, and the rebuild that listing's arrival triggers prunes it if it has gone.
function stillDirectory(state: FilesTabState, relPath: string, onReady: () => void): boolean {
  if (relPath === '') return true;
  const listing = listingFor(state, parentPath(relPath), onReady);
  if (listing === undefined) return true;
  const name = path.posix.basename(relPath);
  return listing.some((entry) => entry.name === name && entry.dir);
}

export function restoreTreeView(port: NavPort, label: string, view: SavedTreeView): void {
  const state = port.states.get(label);
  if (!state) return;
  const onReady = () => { port.rebuild(label); };
  const saved = view.expanded ?? [];

  for (const relPath of saved) {
    if (stillDirectory(state, relPath, onReady)) expandAndWatch(port, label, state, relPath);
  }

  const visible = new Set(buildCachedRows(state, onReady).map((row) => row.path));
  const survives = (relPath: string | undefined): string | undefined =>
    (relPath !== undefined && visible.has(relPath) ? relPath : undefined);
  state.restore = {
    revision: nextRevision++,
    cursor: survives(view.cursor),
    anchor: survives(view.anchor),
    selected: (view.selected ?? []).filter((relPath) => visible.has(relPath)),
  };
  port.rebuild(label);
}
