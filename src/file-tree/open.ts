import { statSync } from 'node:fs';
import { buildRows } from './index.js';
import type { Managers } from '../managers.js';
import type { FilesTabState } from './manager.js';

// The narrow slice of `FileTreeManager` internals this module needs, handed over as bound closures
// so the tab-state map and watcher plumbing stay private to the manager (see `openPort()` there).
export interface OpenPort {
  managers: Managers;
  states: Map<string, FilesTabState>;
  watchDir(label: string, absDir: string, relPath: string): void;
  unwatchDir(state: FilesTabState, relPath: string): void;
  rebuild(label: string): void;
}

// Open a file navigator at `label`'s cwd (the metadata-row 📁 button). If a file-tree tab is already
// open, retarget the most-recently-focused one to that cwd in place — preserving its identity, dock
// placement, and strip position; otherwise open a fresh tree docked in the left sidebar. Either way,
// focus stays on the tab whose button was clicked — opening or retargeting the navigator must not
// steal focus.
export function openOrRetarget(port: OpenPort, label: string): void {
  const cwd = port.managers.tab.cwdOf(label) ?? process.cwd();
  let stat;
  try { stat = statSync(cwd); } catch { stat = undefined; }
  if (!stat?.isDirectory()) return;

  const existing = port.managers.tab.mostRecentFileTreeLabel();
  if (existing) retarget(port, existing, cwd);
  else openFresh(port, cwd);
  port.managers.tab.setActiveTab(port.managers.tab.findIndex(label));
}

// Open a fresh tree rooted at `root`, docked left by default (unlike the bare `files` command's
// center-strip default). Mirrors `FileTreeManager.open()`'s create-and-watch sequence.
function openFresh(port: OpenPort, root: string): void {
  const expanded = new Set<string>();
  port.managers.tab.openFilesTab({ root, absoluteRoot: root, rows: buildRows(root, expanded) });
  const newLabel = port.managers.tab.cur().label;
  port.managers.tab.setCwd(newLabel, root);
  port.states.set(newLabel, { root, expanded, watchers: new Map(), undoStack: [], redoStack: [] });
  port.watchDir(newLabel, root, '');
  port.managers.tab.setDock(port.managers.tab.findIndex(newLabel), 'left');
}

// Retarget an existing file-tree tab's root to an arbitrary absolute directory in place. Reuses
// `reroot()`'s clear-expanded/unwatch/rewatch/rebuild sequence, but — unlike `reroot()` — also
// clears the undo/redo stacks, since jumping to an unrelated directory leaves their relative paths
// meaningless at the new root.
function retarget(port: OpenPort, label: string, root: string): void {
  const state = port.states.get(label);
  if (!state || root === state.root) return;
  for (const relPath of state.expanded) port.unwatchDir(state, relPath);
  state.expanded.clear();
  port.unwatchDir(state, '');
  state.root = root;
  state.undoStack = [];
  state.redoStack = [];
  port.watchDir(label, root, '');
  if (port.managers.tab.tabs.some((t) => t.label === label)) port.managers.tab.setCwd(label, root);
  port.rebuild(label);
}
