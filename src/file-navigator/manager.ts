import { messageBus } from '../bus.js';
import { isSameOrDescendantPath } from './index.js';
import { refreshGit } from './git-refresh.js';
import { openOrRetarget, type OpenPort } from './open.js';
import { openFilesCommand } from './open-command.js';
import type { UndoRedoResult } from './moves.js';
import { deleteItem, moveItem, renameItem } from './filesystem.js';
import { replayHistory } from './manager-history.js';
import { deleteMany, moveMany, pasteMany } from './manager-batch.js';
import { toggleDir, collapseAllDirs, rerootTree, revealPath, type NavPort } from './navigation.js';
import { watchDir, unwatchDir } from './watch.js';
import { pollForDir, stopPolling } from './poll.js';
import { pruneAndBuildRows } from './rebuild.js';
import { buildRows } from './index.js';
import { listProjectFiles } from './search.js';
import { makeNavigationPort, makeOpenPort } from './manager-ports.js';
import { openersForRow } from './openers-for-row.js';
import { restoreTreeView, type SavedTreeView } from './restore.js';
import type { FilesTabState } from './state.js';
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerChoice } from '../protocol.js';
import { findOpenFilesTab } from './find-tab.js';
import { resyncFileNavigator, syncStatusForRoot } from './sync.js';

const DEBOUNCE_MS = 100;

// Owns file navigator tabs: opening/focusing them, their `expanded` directory sets, and one
// non-recursive `fs.watch` per visible directory. Any watch event schedules a single per-tab
// debounced rebuild; the server always owns the tree — the client only ever renders rows.
export class FileNavigatorManager {
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
  // Returns the label of the tab it opened, redocked, or focused, so a profile launch can restore
  // that tree's saved view onto it.
  open(command: string, label: string): string | undefined {
    return openFilesCommand(
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
    return makeNavigationPort(
      this.managers, this.tabs,
      (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      (state, relPath) => this.unwatchDir(state, relPath),
      (label) => this.rebuild(label), (label) => this.refreshGit(label),
    );
  }

  // Open a file navigator at `label`'s cwd (the metadata-row 📁 button). If a file-navigator tab is
  // already open, retarget the most-recently-focused one to that cwd in place — preserving its
  // identity, dock placement, and strip position; otherwise open a fresh tree docked in the left
  // sidebar. Either way, focus stays on the tab whose button was clicked. See `file-navigator/open.ts`.
  openOrRetarget(label: string): void {
    openOrRetarget(this.openPort(), label);
  }

  // The narrow set of manager internals `file-navigator/open.ts` operates through, passed as bound
  // closures so the tab-state map and watcher methods stay private to this class.
  private openPort(): OpenPort {
    return makeOpenPort(
      this.managers, this.tabs,
      (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      (state, relPath) => this.unwatchDir(state, relPath), (label) => this.rebuild(label),
      (label) => this.refreshGit(label),
    );
  }

  // Move a file or directory into a different directory (drag-and-release in the tree). Rejects
  // moving an item onto itself or into one of its own descendants; a same-named entry already at
  // the destination is overwritten (the client has already confirmed that via its own dialog
  // before sending this). Pushes the move onto the tab's undo stack and clears its redo stack —
  // mirroring the editor's own "any new edit invalidates the redo stack" rule. Rebuilds so the
  // tree reflects the change immediately, without waiting on the directory watcher's own debounce.
  move(label: string, fromRelPath: string, toRelPath: string): BatchResult {
    const state = this.tabs.get(label);
    if (!state) return { total: 1, failedPaths: [fromRelPath] };
    if (isSameOrDescendantPath(toRelPath, fromRelPath)) return { total: 1, failedPaths: [fromRelPath] };
    const entry = moveItem(state.root, fromRelPath, toRelPath);
    if (!entry) return { total: 1, failedPaths: [fromRelPath] };
    state.undoStack.push({ entries: [entry] });
    state.redoStack = [];
    this.rebuild(label);
    return { total: 1, failedPaths: [] };
  }

  moveMany(
    label: string,
    sourcePaths: string[],
    destinationPath: string,
    policy?: BulkConflictPolicy,
  ): BulkMoveResult {
    const state = this.tabs.get(label);
    if (!state) return { total: 0, failedPaths: [] };
    return moveMany(state, sourcePaths, destinationPath, policy, () => this.rebuild(label));
  }

  deleteMany(label: string, sourcePaths: string[]): BatchResult {
    const state = this.tabs.get(label);
    if (!state) return { total: 0, failedPaths: [] };
    return deleteMany(state, sourcePaths, () => this.rebuild(label));
  }

  // Copy- or cut-paste a clipboard's absolute source paths into this tab's tree.
  paste(
    label: string,
    sources: string[],
    destinationPath: string,
    mode: 'copy' | 'cut',
    policy?: BulkConflictPolicy,
  ): BulkMoveResult {
    const state = this.tabs.get(label);
    if (!state) return { total: 0, failedPaths: [] };
    return pasteMany(state, sources, destinationPath, mode, policy, () => this.rebuild(label));
  }

  // Undo the most recent move: moves the item back from `to` to `from`'s original directory. A
  // conflict at the destination is reported back without mutating either stack, so a caller-driven
  // overwrite (passing `overwrite: true`) can retry the same pending entry. An empty undo stack is
  // a silent no-op.
  undo(label: string, overwrite = false, skipConflicts = false): UndoRedoResult {
    const state = this.tabs.get(label);
    if (!state) return {};
    return replayHistory(state, 'undo', overwrite, skipConflicts, () => this.rebuild(label));
  }

  // Redo the most recently undone move: re-applies it from `from` to `to`'s original directory.
  // Same conflict-reporting and no-op behavior as `undo`.
  redo(label: string, overwrite = false, skipConflicts = false): UndoRedoResult {
    const state = this.tabs.get(label);
    if (!state) return {};
    return replayHistory(state, 'redo', overwrite, skipConflicts, () => this.rebuild(label));
  }

  // Rename a file or directory in place (same directory only — `newName` may not contain a path
  // separator, which would otherwise move the item elsewhere; that stays drag-and-drop's job). The
  // client has already confirmed an overwrite with the user if `newName` collides with a sibling.
  // If an editor tab is already open on the renamed file, it is retargeted to the new path so it
  // doesn't go stale. Rebuilds so the tree reflects the new name immediately.
  rename(label: string, relPath: string, newName: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    const renamed = renameItem(state.root, relPath, newName);
    if (!renamed) return;
    const [oldAbs, newAbs] = renamed;
    this.managers.tab.retargetEditorTab(oldAbs, newAbs);
    this.rebuild(label);
  }

  // Delete a file or directory (recursively) from disk — the client has already confirmed with
  // the user before sending this. Rebuilds so the tree reflects the removal immediately, without
  // waiting on the directory watcher's own debounce.
  delete(label: string, relPath: string): BatchResult {
    const state = this.tabs.get(label);
    if (!state) return { total: 1, failedPaths: [relPath] };
    if (!deleteItem(state.root, relPath)) return { total: 1, failedPaths: [relPath] };
    this.rebuild(label);
    return { total: 1, failedPaths: [] };
  }

  // The gitignore-aware candidate list for the tab's own Search-files pop-up (async, off the event
  // loop — see `search.ts`), for the deferred `fileNavigatorSearch` RPC.
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
    return openersForRow(state.root, relPath, edit);
  }

  sync(label: string): void {
    resyncFileNavigator(this.managers, this.tabs, label, (current) => this.rebuild(current), (current) => this.refreshGit(current));
  }

  // This tab's expanded directories as a plain sorted array, for `profile save`. Sorted only so the
  // written file is deterministic (profiles are committable); restore order does not matter, since
  // `buildRows` walks from the root and consults the expanded set rather than replaying insertion
  // order.
  expandedPaths(label: string): string[] {
    const state = this.tabs.get(label);
    if (!state) return [];
    return [...state.expanded].toSorted((a, b) => a.localeCompare(b));
  }

  // Replay a saved tree view onto this tab: expand every saved directory that still resolves, then
  // record the surviving cursor/anchor/selection as a restore hint for the client. Best effort and
  // silent — a path that no longer exists is simply dropped.
  restoreView(label: string, view: SavedTreeView): void {
    restoreTreeView(this.navPort(), label, view);
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
    const found = findOpenFilesTab(this.managers, this.tabs, label);
    if (!found) return;
    const { state, tab } = found;
    state.sync = syncStatusForRoot(this.managers, absDir, state.sync);
    tab.files = { root: absDir, absoluteRoot: absDir, rows: buildRows(absDir, state.expanded), sync: state.sync };
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
    const found = findOpenFilesTab(this.managers, this.tabs, label);
    if (!found) return;
    const { state, tab } = found;
    state.sync = syncStatusForRoot(this.managers, state.root, state.sync);
    tab.files = {
      root: state.root, absoluteRoot: state.root, rows: pruneAndBuildRows(state),
      branch: state.branch, githubUrl: state.githubUrl, sync: state.sync, restore: state.restore,
    };
    messageBus.emit('state', { type: 'dirty' });
  }
}
