// File-navigator-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.
import type { FileNavigatorDetail } from '../tab/types.js';

export type FileOpenerChoice = { label: string; command: 'open' | 'edit' | 'open external' };
// How activating one file navigator row resolves (see the `fileNavigatorOpeners` RPC): either a
// single command the client runs straight away, or the fallback options it renders as a chooser.
// A declaration may replace the normal edit gesture with `open external`; video uses it because a
// plain-text editor is useless for a binary container.
// A third case is the forced chooser the RPC's `all` flag asks for ("Open with" in the row's
// context menu): the single-command shortcut is suppressed even for a claimed extension, and the
// registered opener's own action is offered as a choice alongside the two fallbacks.
export type FileOpenerResolution = { command?: 'open' | 'edit' | 'open external'; choices: FileOpenerChoice[] };
// What a tab plugin contributes for a whole file navigator selection (see the
// `fileNavigatorSelectionAction` RPC): the label to draw in the row context menu, and the action
// name to send back when it is activated. `null` when the selection resolves to no such entry —
// empty, mixed, containing a directory, or owned by a plugin contributing nothing for a selection.
// Deliberately carries no plugin identity: the run RPC re-resolves the paths server-side, so the
// client can only ever ask for the entry it was just offered.
export type FileSelectionAction = { label: string; action: string };
export type BulkConflictPolicy = 'overwrite-all' | 'skip-conflicts';
export type BatchResult = {
  total: number;
  failedPaths: string[];
  failureReasons?: Record<string, string>;
};
export type BulkMoveResult = BatchResult | { conflictPaths: string[] };
export type MoveConflict = { fromRelPath: string; toRelPath: string };
export type UndoRedoResult = Partial<BatchResult> & {
  conflict?: MoveConflict;
  conflicts?: MoveConflict[];
};

// One navigator's client-side selection, keyed by the tab `index` every other `fileNavigator*` RPC
// uses. Paths are relative to that tree's root, matching the server's own `expanded` vocabulary.
export type FileNavigatorSelectionRecord = {
  index: number;
  cursor?: string;
  anchor?: string;
  selected: string[];
};

export type FileNavigatorRpcCall =
  // Expand/collapse one directory row in a file navigator tab. `index` is the tab's position in the
  // server's full tab list (resolved to a label server-side); `path` is the row's tree-relative path.
  | { method: 'fileNavigatorToggle'; params: { index: number; path: string } }
  // Collapse every expanded directory in a file navigator tab back to just its root.
  | { method: 'fileNavigatorCollapseAll'; params: { index: number } }
  // Pull the tab root's repository up to date from `origin` (the header's pull button), then
  // refresh the tree's rows and git metadata. Fire-and-forget: the outcome surfaces through the
  // next state broadcast, or as a notifications-feed line when the pull fails.
  | { method: 'fileNavigatorPull'; params: { index: number } }
  // Switch which per-row detail a file navigator tab shows (its header's detail button).
  | { method: 'fileNavigatorSetDetail'; params: { index: number; details: FileNavigatorDetail } }
  // Re-root a file navigator tab to the parent directory.
  | { method: 'fileNavigatorReroot'; params: { index: number; path?: string } }
  // Move a file or directory in a file navigator tab into a different directory (drag-and-release).
  // `fromRelPath` is the dragged item's tree-relative path; `toRelPath` is the destination
  // directory's tree-relative path.
  | { method: 'moveFileNavigatorItem'; params: { index: number; fromRelPath: string; toRelPath: string } }
  | {
      method: 'moveFileNavigatorItems';
      params: {
        index: number;
        sourcePaths: string[];
        destinationPath: string;
        policy?: BulkConflictPolicy;
      };
    }
  // Copy- or cut-paste the clipboard's absolute source paths into a file navigator tab.
  // `destinationPath` is tree-relative to the pasting tab's own root; `sources` are absolute, since
  // the app-wide clipboard's items may live outside that root.
  | {
      method: 'pasteFileNavigatorItems';
      params: {
        index: number;
        sources: string[];
        destinationPath: string;
        mode: 'copy' | 'cut';
        policy?: BulkConflictPolicy;
        sourceHost?: string;
      };
    }
  // Delete a file or directory (recursively) from a file navigator tab, after the client has already
  // confirmed with the user. `relPath` is the tree-relative path of the row being removed.
  | { method: 'deleteFileNavigatorItem'; params: { index: number; relPath: string } }
  | { method: 'deleteFileNavigatorItems'; params: { index: number; paths: string[] } }
  // Rename a file or directory in place within a file navigator tab (in-directory only — the client has
  // already confirmed an overwrite with the user, if the new name collides with a sibling).
  // `relPath` is the tree-relative path of the row being renamed; `newName` is the bare new name
  // (no path separators).
  | { method: 'renameFileNavigatorItem'; params: { index: number; relPath: string; newName: string } }
  // List every gitignore-aware file under a file navigator tab's own root, for its Search-files
  // pop-up. Replies (deferred) with `{ paths }` — root-relative, matching the tree's own rows.
  | { method: 'fileNavigatorSearch'; params: { index: number } }
  // Expand every ancestor directory of `relPath` in a file navigator tab (adding to `expanded`,
  // watching, rebuilding); the client separately selects and scrolls to it once the resulting
  // rows arrive. The search pop-up's Enter action.
  | { method: 'revealFileNavigatorItem'; params: { index: number; relPath: string } }
  // `all` suppresses the single-command shortcut so the reply always carries the full choice list,
  // which is what the row context menu's "Open with" entry needs to force the chooser open.
  | { method: 'fileNavigatorOpeners'; params: { index: number; relPath: string; edit: boolean; all?: boolean } }
  | {
      method: 'fileNavigatorOpen';
      params: { index: number; relPath: string; command: FileOpenerChoice['command'] };
    }
  | { method: 'fileNavigatorCreateFile'; params: { index: number; destination: string } }
  | { method: 'fileNavigatorCreateDirectory'; params: { index: number; destination: string } }
  // What a tab plugin contributes for a whole selection of rows, for the row context menu. Replies
  // with a `FileSelectionAction` when every selected path is a file of one plugin's own claimed
  // types and that plugin contributes an entry, and with `null` otherwise. Resolving never activates
  // the plugin — opening a menu is not a use of it.
  | { method: 'fileNavigatorSelectionAction'; params: { index: number; paths: string[] } }
  // Run the entry the RPC above just offered. The server re-resolves `paths` against the navigator's
  // own root and re-derives the owning plugin, so the client names neither a plugin nor an action
  // the server did not offer it. Fire-and-forget; the plugin's own tab is the result.
  | { method: 'runFileNavigatorSelectionAction'; params: { index: number; paths: string[]; action: string } }
  // Answer to a `collect-tree-state` event: every mounted file navigator's cursor/anchor/selection,
  // tagged with the request `id` so a late reply to an earlier `profile save` is discarded.
  // Fire-and-forget — the server sends no reply of its own.
  | { method: 'reportFileNavigatorSelection'; params: { id: number; navigators: FileNavigatorSelectionRecord[] } }
  // Undo/redo the most recent move in a file navigator tab's per-tab undo/redo stack. `overwrite`
  // retries a pending entry after the client has confirmed an overwrite of a conflicting
  // destination; the reply's `result` carries `{ conflict }` when one is found instead.
  | { method: 'undoFileNavigatorItem'; params: { index: number; overwrite?: boolean; skipConflicts?: boolean } }
  | { method: 'redoFileNavigatorItem'; params: { index: number; overwrite?: boolean; skipConflicts?: boolean } }
  // Open a file navigator rooted at the named tab's cwd, triggered by the 📁 button in a
  // harness/agent tab's metadata row. If a file navigator tab is already open, its root is retargeted
  // to that cwd in place; otherwise a fresh one opens docked in the left sidebar. Either way the
  // resulting file navigator tab is focused. `label` is the requesting tab's own label.
  | { method: 'openFileNavigatorFor'; params: { label: string } };
