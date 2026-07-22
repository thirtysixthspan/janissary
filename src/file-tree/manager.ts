import { renameSync, rmSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { messageBus } from '../bus.js';
import { isSameOrDescendantPath, parentPath } from './index.js';
import { refreshGit } from './git-refresh.js';
import { openOrRetarget, type OpenPort } from './open.js';
import { openFilesCommand } from './open-command.js';
import { applyStackMove, type MoveEntry, type UndoRedoResult } from './moves.js';
import { toggleDir, collapseAllDirs, rerootTree, revealPath, type NavPort } from './navigation.js';
import { watchDir, unwatchDir } from './watch.js';
import { pollForDir, stopPolling } from './poll.js';
import { pruneAndBuildRows } from './rebuild.js';
import { buildRows } from './index.js';
import { listProjectFiles } from './search.js';
import type { Managers } from '../managers.js';
import type { GitFileStatus } from '../git-status.js';
import { openerForExtension } from '../openers/index.js';
import type { FileOpenerChoice } from '../protocol.js';

const DEBOUNCE_MS = 100;

// Per files-tab state, keyed by the tab's label. `watchers` is keyed by each visible directory's
// tree-relative path ('' for the root itself). `undoStack`/`redoStack` are purely in-memory and
// reset with the rest of the tab's state on close.
export type FilesTabState = {
  root: string;
  expanded: Set<string>;
  watchers: Map<string, FSWatcher>;
  debounce?: ReturnType<typeof setTimeout>;
  // Set while the tab is waiting for its root to be created (see `pollForCreation`); cleared once
  // the directory appears.
  pollTimer?: ReturnType<typeof setInterval>;
  undoStack: MoveEntry[];
  redoStack: MoveEntry[];
  // Last-computed map of git-changed, root-relative paths to their status (see `git-status.ts`).
  // Applied synchronously to every rebuild so interactive redraws are instant; recomputed
  // asynchronously by `refreshGit`. `gitRefreshing`/`gitRefreshStale` coalesce overlapping refresh
  // requests into at most one in-flight git call plus one queued follow-up.
  gitStatuses?: Map<string, GitFileStatus>;
  // Last-computed current git branch name (see `git-status.ts`), refreshed alongside `changed`.
  branch?: string;
  gitRefreshing?: boolean;
  gitRefreshStale?: boolean;
};

// Owns file tree tabs: opening/focusing them, their `expanded` directory sets, and one
// non-recursive `fs.watch` per visible directory. Any watch event schedules a single per-tab
// debounced rebuild; the server always owns the tree — the client only ever renders rows.
export class FileTreeManager {
  private tabs = new Map<string, FilesTabState>();

  constructor(private managers: Managers) {}

  // Handle a `files [left|right] [path]` command: open a new tree tab rooted at `path` (or the
  // issuing tab's cwd), or focus/redock the existing tab if one is already open on that root.
  // A leading `left`/`right` keyword docks the tab into that sidebar; a directory literally named
  // `left`/`right` is still reachable via a path form (`files ./left`), since the keyword is only
  // recognized as the first word. `in <label>` roots the tree at another tab's cwd instead of the
  // issuing tab's, and `on <left|right>` is an explicit spelling of the same docking the bare
  // keyword provides; both are optional, independent, and may appear in either order (`files in
  // claude on left`). Like `left`/`right`, they are only recognized as clause keywords — a
  // directory literally named `in`/`on` stays reachable via a path form (`files ./in`).
  open(command: string, label: string): void {
    openFilesCommand(
      this.managers, this.tabs, command, label,
      (l, a, r) => this.watchDir(l, a, r), (l) => this.refreshGit(l), (l, a) => this.pollForCreation(l, a),
    );
  }

  // Expand/collapse one directory row.
  toggle(label: string, relPath: string): void {
    toggleDir(this.navPort(), label, relPath);
  }

  // Collapse every expanded directory back to just the root.
  collapseAll(label: string): void {
    collapseAllDirs(this.navPort(), label);
  }

  // Re-root the tree to the parent directory. Clears expanded state and watchers, then rebuilds.
  reroot(label: string, relPath?: string): void {
    rerootTree(this.navPort(), label, relPath);
  }

  // The narrow set of manager internals `navigation.ts` operates through, passed as bound
  // closures so the tab-state map and watcher methods stay private to this class.
  private navPort(): NavPort {
    return {
      states: this.tabs,
      watchDir: (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      unwatchDir: (state, relPath) => this.unwatchDir(state, relPath),
      rebuild: (label) => this.rebuild(label),
      refreshGit: (label) => this.refreshGit(label),
      setCwd: (label, dir) => this.managers.tab.setCwd(label, dir),
      hasTab: (label) => this.managers.tab.tabs.some((t) => t.label === label),
    };
  }

  // Open a file navigator at `label`'s cwd (the metadata-row 📁 button). If a file-tree tab is
  // already open, retarget the most-recently-focused one to that cwd in place — preserving its
  // identity, dock placement, and strip position; otherwise open a fresh tree docked in the left
  // sidebar. Either way, focus stays on the tab whose button was clicked. See `file-tree-open.ts`.
  openOrRetarget(label: string): void {
    openOrRetarget(this.openPort(), label);
  }

  // The narrow set of manager internals `file-tree-open.ts` operates through, passed as bound
  // closures so the tab-state map and watcher methods stay private to this class.
  private openPort(): OpenPort {
    return {
      managers: this.managers,
      states: this.tabs,
      watchDir: (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      unwatchDir: (state, relPath) => this.unwatchDir(state, relPath),
      rebuild: (label) => this.rebuild(label),
    };
  }

  // Move a file or directory into a different directory (drag-and-release in the tree). Rejects
  // moving an item onto itself or into one of its own descendants; a same-named entry already at
  // the destination is overwritten (the client has already confirmed that via its own dialog
  // before sending this). Pushes the move onto the tab's undo stack and clears its redo stack —
  // mirroring the editor's own "any new edit invalidates the redo stack" rule. Rebuilds so the
  // tree reflects the change immediately, without waiting on the directory watcher's own debounce.
  move(label: string, fromRelPath: string, toRelPath: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (isSameOrDescendantPath(toRelPath, fromRelPath)) return;
    const fromAbs = path.join(state.root, fromRelPath);
    const name = path.basename(fromAbs);
    const toAbs = path.join(state.root, toRelPath, name);
    try { renameSync(fromAbs, toAbs); } catch { return; }
    state.undoStack.push({ from: fromRelPath, to: toRelPath ? `${toRelPath}/${name}` : name });
    state.redoStack = [];
    this.rebuild(label);
  }

  // Undo the most recent move: moves the item back from `to` to `from`'s original directory. A
  // conflict at the destination is reported back without mutating either stack, so a caller-driven
  // overwrite (passing `overwrite: true`) can retry the same pending entry. An empty undo stack is
  // a silent no-op.
  undo(label: string, overwrite = false): UndoRedoResult {
    const state = this.tabs.get(label);
    if (!state) return {};
    const entry = state.undoStack.at(-1);
    if (!entry) return {};
    return applyStackMove(state.root, entry.to, parentPath(entry.from), entry, state.undoStack, state.redoStack, overwrite, () => this.rebuild(label));
  }

  // Redo the most recently undone move: re-applies it from `from` to `to`'s original directory.
  // Same conflict-reporting and no-op behavior as `undo`.
  redo(label: string, overwrite = false): UndoRedoResult {
    const state = this.tabs.get(label);
    if (!state) return {};
    const entry = state.redoStack.at(-1);
    if (!entry) return {};
    return applyStackMove(state.root, entry.from, parentPath(entry.to), entry, state.redoStack, state.undoStack, overwrite, () => this.rebuild(label));
  }

  // Rename a file or directory in place (same directory only — `newName` may not contain a path
  // separator, which would otherwise move the item elsewhere; that stays drag-and-drop's job). The
  // client has already confirmed an overwrite with the user if `newName` collides with a sibling.
  // If an editor tab is already open on the renamed file, it is retargeted to the new path so it
  // doesn't go stale. Rebuilds so the tree reflects the new name immediately.
  rename(label: string, relPath: string, newName: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (newName.includes('/') || newName.includes(path.sep)) return;
    const oldAbs = path.join(state.root, relPath);
    const newAbs = path.join(path.dirname(oldAbs), newName);
    try { renameSync(oldAbs, newAbs); } catch { return; }
    this.managers.tab.retargetEditorTab(oldAbs, newAbs);
    this.rebuild(label);
  }

  // Delete a file or directory (recursively) from disk — the client has already confirmed with
  // the user before sending this. Rebuilds so the tree reflects the removal immediately, without
  // waiting on the directory watcher's own debounce.
  delete(label: string, relPath: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    const abs = path.join(state.root, relPath);
    try { rmSync(abs, { recursive: true }); } catch { return; }
    this.rebuild(label);
  }

  // The gitignore-aware candidate list for the tab's own Search-files pop-up (async, off the event
  // loop — see `search.ts`), for the deferred `fileTreeSearch` RPC.
  async search(label: string): Promise<string[]> {
    const state = this.tabs.get(label);
    if (!state) return [];
    return listProjectFiles(state.root);
  }

  // Expand every ancestor directory of `relPath` not already expanded (adding to `expanded`,
  // watching each newly-expanded one), then rebuild — the search pop-up's Enter action, so the
  // target row exists in the client's next `rows` update for it to select and scroll to.
  reveal(label: string, relPath: string): void {
    revealPath(this.navPort(), label, relPath);
  }

  openers(label: string, relPath: string, edit: boolean): { command?: 'open' | 'edit'; choices: FileOpenerChoice[] } {
    const state = this.tabs.get(label);
    if (!state) return { choices: [] };
    const opener = openerForExtension(path.extname(path.resolve(state.root, relPath)));
    if (opener) return { command: edit ? 'edit' : 'open', choices: [] };
    return {
      choices: [
        { label: 'Edit as text', command: 'edit' },
        { label: 'Open externally', command: 'open external' },
      ],
    };
  }

  // Tear down one tab's watchers and debounce timer (on tab close).
  closeTab(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    stopPolling(state);
    for (const watcher of state.watchers.values()) { try { watcher.close(); } catch { /* already gone */ } }
    this.tabs.delete(label);
  }

  // Tear down every tab's watchers (app shutdown).
  dispose(): void {
    for (const label of this.tabs.keys()) this.closeTab(label);
  }

  private watchDir(label: string, absDir: string, relPath: string): void {
    watchDir(this.tabs, label, absDir, relPath, () => this.scheduleRebuild(label));
  }

  // Poll a not-yet-existing root until it's created, then build the tree for real and start
  // watching it — the tail end of what `openFilesCommand` does for a root that already exists.
  private pollForCreation(label: string, absDir: string): void {
    pollForDir(this.tabs, label, absDir, () => this.onDirCreated(label, absDir));
  }

  private onDirCreated(label: string, absDir: string): void {
    const found = this.findOpenFilesTab(label);
    if (!found) return;
    const { state, tab } = found;
    tab.files = { root: absDir, absoluteRoot: absDir, rows: buildRows(absDir, state.expanded) };
    this.watchDir(label, absDir, '');
    this.refreshGit(label);
    messageBus.emit('state', { type: 'dirty' });
  }

  private unwatchDir(state: FilesTabState, relPath: string): void {
    unwatchDir(state, relPath);
  }

  private scheduleRebuild(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => { this.rebuild(label); this.refreshGit(label); }, DEBOUNCE_MS);
  }

  private refreshGit(label: string): void {
    refreshGit(this.tabs, label, (l) => this.rebuild(l));
  }

  // Rebuild the visible row list (pruning expanded directories that no longer exist) and write it
  // onto the tab's payload.
  private rebuild(label: string): void {
    const found = this.findOpenFilesTab(label);
    if (!found) return;
    const { state, tab } = found;
    tab.files = { root: state.root, absoluteRoot: state.root, rows: pruneAndBuildRows(state), branch: state.branch };
    messageBus.emit('state', { type: 'dirty' });
  }

  // Looks up a tab's file-tree state and its open `files` payload together — both `onDirCreated`
  // and `rebuild` bail out the same way if either is missing.
  private findOpenFilesTab(label: string) {
    const state = this.tabs.get(label);
    if (!state) return;
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.files) return;
    return { state, tab };
  }
}
