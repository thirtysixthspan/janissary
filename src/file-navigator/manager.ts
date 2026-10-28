import { isPrimaryBranch } from '../git/status.js';
import { openOrRetarget, type OpenPort } from './open.js';
import { openFilesCommand } from './open-command.js';
import type { FileNavigatorOpenArgs } from './args.js';
import { applyViewSteps } from './restore-command.js';
import { toTreePath } from './view-paths.js';
import { expandUserPath } from '../paths.js';
import { requestTreeSelections } from './selection-request.js';
import { formatFilesCommand } from './print-command.js';
import {
  createDirectoryIn, deleteItem, deleteItems, moveItem, moveItems, pasteItems, renameItem,
  replayMutation, type MutationContext,
} from './manager/mutations.js';
import { toggleDir, collapseAllDirs, rerootTree, revealPath, type NavPort } from './navigation.js';
import { detailOfTab, expandedPathsOf, setTabDetail } from './manager/profile.js';
import { makeNavigationPort, makeOpenPort } from './manager/ports.js';
import { WatchedFilesTabs } from './watched-tabs.js';
import type { PortClosures } from './port.js';
import { openersForRow } from './openers-for-row.js';
import type { FileNavigatorDetail, Tab } from '../tab/types.js';
import { runPull } from './manager/pull.js';
import { runCommit } from './manager/commit.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerResolution, UndoRedoResult } from '../protocol.js';
import type { MaybePromise } from '../maybe-promise.js';
import { createNavigatorFile, openNavigatorFile } from './manager/files.js';
import type { FileOpenerChoice } from '../protocol.js';
import { withFilesState } from './manager/state.js';

// Owns file navigator tabs: opening/focusing them, their `expanded` directory sets, and their rows.
// The tab map and the watch/rebuild lifecycle every tab runs on live in `WatchedFilesTabs`; the
// server always owns the tree — the client only ever renders rows.
export class FileNavigatorManager extends WatchedFilesTabs {

  // Open or focus a tree from the parsed `files` arguments, then apply any requested view steps to
  // the returned local tree. The root path remains last, and a leading bare side may precede clauses.
  // Returns the label of the tab it opened, redocked, or focused.
  open(parsed: FileNavigatorOpenArgs, label: string, out: (text: string) => void): string | undefined {
    const openedLabel = openFilesCommand(
      this.managers, this.tabs, parsed, label, out,
      (l, a, r) => this.watchDir(l, a, r), (l) => this.refreshGit(l), (l, a) => this.pollForCreation(l, a),
      (l) => this.rebuild(l),
    );
    if (!openedLabel || parsed.steps.length === 0) return openedLabel;
    const state = this.tabs.get(openedLabel);
    if (!state || state.pollTimer || state.remote) return openedLabel;
    const steps = parsed.steps.flatMap((step) => {
      const treePath = toTreePath(
        step.path,
        state.root,
        (input) => expandUserPath(input, { root: this.managers.tab.launchDir }),
      );
      return treePath === undefined ? [] : [{ ...step, path: treePath }];
    });
    applyViewSteps(this.navPort(), openedLabel, steps);
    return openedLabel;
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
    return makeNavigationPort(this.managers, this.tabs, this.portClosures());
  }

  // Bound closures shared by `navPort()` and `openPort()` for the watcher/rebuild plumbing both
  // ports expose identically, keyed by name so no two of them can swap places.
  private portClosures(): PortClosures {
    return {
      watchDir: (label, absDir, relPath) => this.watchDir(label, absDir, relPath),
      unwatchDir: (state, relPath) => this.unwatchDir(state, relPath),
      rebuild: (label) => this.rebuild(label),
      refreshGit: (label) => this.refreshGit(label),
    };
  }

  // The manager internals `manager/mutations.ts` operates through, passed the same way the
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
    return makeOpenPort(this.managers, this.tabs, this.portClosures());
  }

  // Move a file or directory into a different directory (drag-and-release in the tree). Rejects
  // moving an item onto itself or into one of its own descendants. A same-named entry already at
  // the destination is overwritten only when `overwrite` is set — the client sends it from its
  // conflict dialog's confirm — and otherwise answers `{ conflictPaths }` with nothing moved. Pushes
  // the move onto the tab's undo stack and clears its redo stack — mirroring the editor's own "any
  // new edit invalidates the redo stack" rule. Rebuilds so the tree reflects the change
  // immediately, without waiting on the directory watcher's own debounce.
  move(label: string, fromRelPath: string, toRelPath: string, overwrite?: boolean): MaybePromise<BulkMoveResult> {
    return moveItem(this.mutationContext(), label, fromRelPath, toRelPath, overwrite);
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
  rename(label: string, relPath: string, newName: string, overwrite?: boolean): MaybePromise<BatchResult | { conflict: true }> {
    return renameItem(this.mutationContext(), label, relPath, newName, overwrite);
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

  // For the GitHub-sync gate: whether this tab's tree is confirmably on its repository's primary
  // branch, per `isPrimaryBranch` (`src/git/status.ts`) — the same branch the header displays.
  // `undefined` covers the two cases where this tree cannot govern the gate at all: `label` names no
  // navigator tab, and the tab has not yet had a git-metadata result land for its current root (a
  // freshly opened or just-rerooted tree). Both are distinct from "navigator, not primary", which is
  // a confident `false` — without the second case a tree would answer `false` for as long as its
  // whole-tree metadata load takes, which is seconds on a large repository.
  onPrimaryBranch(label: string): boolean | undefined {
    return withFilesState(this.tabs, label, undefined, (state) => (
      state.gitMetadataLoaded ? isPrimaryBranch(state.branch, state.defaultBranch) : undefined
    ));
  }

  // This tab's expanded directories, which `files print` writes back as `expand` clauses, and its
  // detail mode.
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
  // the outcome on the button itself and in the notifications feed — see `manager/pull.ts`.
  pull(label: string): void {
    runPull({ ...this.mutationContext(), refreshGit: (l) => this.refreshGit(l) }, label);
  }

  // Commit the named tree-relative paths — or the whole tree, for an empty list — and push them to
  // `origin`, reporting the outcome on the header button and in the notifications feed. See
  // `manager/commit.ts`.
  commit(label: string, message: string, paths: string[]): void {
    runCommit({ ...this.mutationContext(), refreshGit: (l) => this.refreshGit(l) }, label, message, paths);
  }

  async printView(tab: Tab): Promise<string> {
    if (!tab.files) return `files: "${tab.label}" is not a file navigator`;
    const state = this.tabs.get(tab.label);
    if (!state) return `files: "${tab.label}" is not a file navigator`;
    const capturedRoot = state.root;
    const selections = state.remote ? undefined : await requestTreeSelections();
    const selection = this.tabs.get(tab.label) === state && state.root === capturedRoot
      ? selections?.get(tab.label)
      : undefined;
    const remote = state.remote
      ? {
          ownerLabel: state.ownerLabel ?? tab.label,
          root: state.remoteRoot ?? this.managers.remote.workspaceOf(state.ownerLabel ?? tab.label),
        }
      : undefined;
    return formatFilesCommand({
      root: state.root,
      launchDir: this.managers.tab.launchDir,
      dock: tab.dock,
      details: state.details,
      expanded: this.expandedPaths(tab.label),
      selection,
      ...(remote && { remote }),
    });
  }
}
