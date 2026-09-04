import { messageBus } from '../bus.js';
import { refreshGit } from './git-refresh.js';
import { openOrRetarget, type OpenPort } from './open.js';
import { openFilesCommand } from './open-command.js';
import {
  createDirectoryIn, deleteItem, deleteItems, moveItem, moveItems, pasteItems, renameItem,
  replayMutation, type MutationContext,
} from './manager-mutations.js';
import { toggleDir, collapseAllDirs, rerootTree, revealPath, type NavPort } from './navigation.js';
import { watchDir, unwatchDir } from './watch.js';
import { pollForDir } from './poll.js';
import { writeCreatedPayload, writeRebuiltPayload } from './manager-payload.js';
import { detailOfTab, expandedPathsOf, setTabDetail } from './manager-profile.js';
import { makeNavigationPort, makeOpenPort } from './manager-ports.js';
import { openersForRow } from './openers-for-row.js';
import { restoreTreeView, type SavedTreeView } from './restore.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { invalidateDirectory } from './filesystem-cache.js';
import { runPull } from './manager-pull.js';
import { closeFileNavigatorTabs } from './manager-close.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerResolution, UndoRedoResult } from '../protocol.js';
import type { MaybePromise } from '../maybe-promise.js';
import { createNavigatorFile, openNavigatorFile } from './manager-files.js';
import type { FileOpenerChoice } from '../protocol.js';
import { findOpenFilesTab, withFilesState } from './manager-state.js';

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
      (l) => this.rebuild(l),
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
    return makeNavigationPort(this.managers, this.tabs, ...this.portClosures());
  }

  // Bound closures shared by `navPort()` and `openPort()` for the watcher/rebuild plumbing both
  // ports expose identically.
  private portClosures(): [NavPort['watchDir'], NavPort['unwatchDir'], NavPort['rebuild'], NavPort['refreshGit']] {
    return [
      (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      (state, relPath) => this.unwatchDir(state, relPath),
      (label) => this.rebuild(label),
      (label) => this.refreshGit(label),
    ];
  }

  // The manager internals `manager-mutations.ts` operates through, passed the same way the
  // navigation and open ports are — as one value carrying a bound `rebuild`, so the tab-state map
  // and the redraw stay private to this class.
  private mutationContext(): MutationContext {
    return { managers: this.managers, tabs: this.tabs, rebuild: (label) => this.rebuild(label) };
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
    return makeOpenPort(this.managers, this.tabs, ...this.portClosures());
  }

  // Move a file or directory into a different directory (drag-and-release in the tree). Rejects
  // moving an item onto itself or into one of its own descendants; a same-named entry already at
  // the destination is overwritten (the client has already confirmed that via its own dialog
  // before sending this). Pushes the move onto the tab's undo stack and clears its redo stack —
  // mirroring the editor's own "any new edit invalidates the redo stack" rule. Rebuilds so the
  // tree reflects the change immediately, without waiting on the directory watcher's own debounce.
  move(label: string, fromRelPath: string, toRelPath: string): MaybePromise<BatchResult> {
    return moveItem(this.mutationContext(), label, fromRelPath, toRelPath);
  }

  moveMany(
    label: string,
    sourcePaths: string[],
    destinationPath: string,
    policy?: BulkConflictPolicy,
  ): MaybePromise<BulkMoveResult> {
    return moveItems(this.mutationContext(), label, sourcePaths, destinationPath, policy);
  }

  deleteMany(label: string, sourcePaths: string[]): MaybePromise<BatchResult> {
    return deleteItems(this.mutationContext(), label, sourcePaths);
  }

  // Copy- or cut-paste a clipboard's absolute source paths into this tab's tree.
  paste(
    label: string,
    sources: string[],
    destinationPath: string,
    mode: 'copy' | 'cut',
    policy?: BulkConflictPolicy,
    sourceHost?: string,
  ): MaybePromise<BulkMoveResult> {
    return pasteItems(this.mutationContext(), label, sources, destinationPath, mode, policy, sourceHost);
  }

  // Undo the most recent move: moves the item back from `to` to `from`'s original directory. A
  // conflict at the destination is reported back without mutating either stack, so a caller-driven
  // overwrite (passing `overwrite: true`) can retry the same pending entry. An empty undo stack is
  // a silent no-op.
  undo(label: string, overwrite = false, skipConflicts = false): MaybePromise<UndoRedoResult> {
    return replayMutation(this.mutationContext(), label, 'undo', overwrite, skipConflicts);
  }

  // Redo the most recently undone move: re-applies it from `from` to `to`'s original directory.
  // Same conflict-reporting and no-op behavior as `undo`.
  redo(label: string, overwrite = false, skipConflicts = false): MaybePromise<UndoRedoResult> {
    return replayMutation(this.mutationContext(), label, 'redo', overwrite, skipConflicts);
  }

  // Rename a file or directory in place (same directory only — `newName` may not contain a path
  // separator, which would otherwise move the item elsewhere; that stays drag-and-drop's job). The
  // client has already confirmed an overwrite with the user if `newName` collides with a sibling.
  // If an editor tab is already open on the renamed file, it is retargeted to the new path so it
  // doesn't go stale. Rebuilds so the tree reflects the new name immediately.
  rename(label: string, relPath: string, newName: string): MaybePromise<BatchResult> {
    return renameItem(this.mutationContext(), label, relPath, newName);
  }

  // Delete a file or directory (recursively) from disk — the client has already confirmed with
  // the user before sending this. Rebuilds so the tree reflects the removal immediately, without
  // waiting on the directory watcher's own debounce.
  delete(label: string, relPath: string): MaybePromise<BatchResult> {
    return deleteItem(this.mutationContext(), label, relPath);
  }

  // The gitignore-aware candidate list for the tab's own Search-files pop-up (async, off the event
  // loop — see `search.ts`), for the deferred `fileNavigatorSearch` RPC.
  async search(label: string): Promise<string[]> {
    return withFilesState(this.tabs, label, Promise.resolve([] as string[]), (state) => state.filesystem.search(state.root));
  }

  // Expand every ancestor directory of `relPath` not already expanded (adding to `expanded`,
  // watching each newly-expanded one), then rebuild — the search pop-up's Enter action, so the
  // target row exists in the client's next `rows` update for it to select and scroll to.
  reveal(label: string, relPath: string): void {
    revealPath(this.navPort(), label, relPath);
  }

  openers(label: string, relPath: string, edit: boolean, all?: boolean): FileOpenerResolution {
    return withFilesState(this.tabs, label, { choices: [] }, (state) => openersForRow(state.root, relPath, edit, all));
  }

  openFile(label: string, relPath: string, command: FileOpenerChoice['command']): MaybePromise<void> {
    return withFilesState(this.tabs, label, undefined, (state) => openNavigatorFile(this.managers, state, label, relPath, command));
  }

  createFile(label: string, destination: string): MaybePromise<void> {
    return withFilesState(this.tabs, label, undefined, (state) => createNavigatorFile(this.managers, state, label, destination));
  }

  createDirectory(label: string, destination: string): MaybePromise<string | undefined> {
    return createDirectoryIn(this.mutationContext(), label, destination);
  }

  // This tab's own root, for the selection-action RPCs: the client sends tree-relative rows, and the
  // server resolves them against the root it holds rather than any path the client could name.
  rootOf(label: string): string | undefined {
    return withFilesState(this.tabs, label, undefined, (state) => state.root);
  }

  // This tab's expanded directories and detail mode, both for `profile save`.
  expandedPaths(label: string): string[] {
    return expandedPathsOf(this.tabs, label);
  }

  detailOf(label: string): FileNavigatorDetail {
    return detailOfTab(this.tabs, label);
  }

  // Switch which detail this tree shows beside each row name (the header's detail button).
  setDetail(label: string, details: FileNavigatorDetail): void {
    setTabDetail(this.tabs, label, details, (l) => this.rebuild(l));
  }

  // Pull the tree root's repository up to date from `origin` (the header's pull button), reporting
  // the outcome on the button itself and in the notifications feed — see `manager-pull.ts`.
  pull(label: string): void {
    runPull({ ...this.mutationContext(), refreshGit: (l) => this.refreshGit(l) }, label);
  }

  // Replay a saved tree view onto this tab: expand every saved directory that still resolves, then
  // record the surviving cursor/anchor/selection as a restore hint for the client. Best effort and
  // silent — a path that no longer exists is simply dropped.
  restoreView(label: string, view: SavedTreeView): void {
    restoreTreeView(this.navPort(), label, view);
  }

  // Tear down one tab's watchers and debounce timer (on tab close).
  closeTab(label: string): void {
    closeFileNavigatorTabs(this.managers, this.tabs, label);
  }

  // Tear down every tab's watchers (app shutdown).
  dispose(): void {
    for (const label of this.tabs.keys()) this.closeTab(label);
  }

  private watchDir(label: string, absDir: string, relPath: string): void {
    watchDir(this.tabs, label, absDir, relPath, () => this.scheduleRebuild(label, relPath));
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
    writeCreatedPayload(tab, state, absDir, () => this.rebuild(label));
    this.watchDir(label, absDir, '');
    this.refreshGit(label);
    messageBus.emit('state', { type: 'dirty' });
  }

  private unwatchDir(state: FilesTabState, relPath: string): void {
    unwatchDir(state, relPath);
  }

  private scheduleRebuild(label: string, relPath = ''): void {
    withFilesState(this.tabs, label, undefined, (state) => {
      if (state.debounce) clearTimeout(state.debounce);
      // The watcher fired, so every cached stat is suspect — empty the cache and let the rebuild
      // re-read only the rows that are actually visible.
      invalidateDirectory(state, relPath);
      state.debounce = setTimeout(() => { this.rebuild(label); this.refreshGit(label); }, DEBOUNCE_MS);
    });
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
    writeRebuiltPayload(tab, state, () => this.rebuild(label));
    messageBus.emit('state', { type: 'dirty' });
  }

}
