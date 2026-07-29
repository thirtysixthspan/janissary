import { statSync } from 'node:fs';
import path from 'node:path';
import { buildRows } from './index.js';
import { expandAndWatch, type NavPort } from './navigation.js';

// Replays a tree view saved by `profile save` onto a freshly opened navigator: the expanded
// directories go back into server state, and the cursor/anchor/selection become a hint the client
// applies once. Everything here is best effort and silent — a saved path that no longer resolves
// is dropped, exactly as `pruneAndBuildRows` drops a vanished expanded directory on every rebuild.

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

export function restoreTreeView(port: NavPort, label: string, view: SavedTreeView): void {
  const state = port.states.get(label);
  if (!state) return;

  const saved = view.expanded ?? [];
  for (const relPath of saved) {
    let isDir: boolean;
    try { isDir = statSync(path.join(state.root, relPath)).isDirectory(); } catch { isDir = false; }
    if (isDir) expandAndWatch(port, label, state, relPath);
  }

  const visible = new Set(buildRows(state.root, state.expanded).map((row) => row.path));
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
