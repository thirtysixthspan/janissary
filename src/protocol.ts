// Wire types shared between the Node server and the React web client.
// The web client imports these directly via the @shared path alias — no mirror needed.
import type { BufferLine, ImageView, PageView, HarnessView, MarkdownView, EditorView, TerminalEntry, CompletionResult, FileTreeView, FileTreeRow, TaskRow } from './types.js';

// Used locally in TabView below, so separate import + export is required.
// eslint-disable-next-line unicorn/prefer-export-from
export type { BufferLine, ImageView, PageView, HarnessView, MarkdownView, EditorView, TerminalEntry, CompletionResult, FileTreeView, FileTreeRow, TaskRow };

// One row in the floating "connections" panel (shell / acp / terminal card / sqlite).
export type ConnectionView = { text: string; kind: 'shell' | 'acp' | 'browser' | 'terminal' | 'sqlite' | 'ssh' };
// One row in the floating "schedule" panel.
export type ScheduleView = { id: string; spec: string; next: string; recurring: boolean };
// A pending route chooser: the unprefixed command plus the option labels to pick from.
export type RouteChooserView = { cmd: string; choices: string[] };
// The open "New harness" launch dialog's data: the ordered harness names and each harness's known
// model catalog (empty for a harness with no catalog). Null in the snapshot when the dialog is closed.
export type HarnessLaunchView = { names: string[]; models: Record<string, string[]> };

// One AI-monitor suggestion in the monitor window's feed: which persona produced it, which
// tab's activity it is about, and the optional one-click command.
export type SuggestionView = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  persona: string;
  about: string;
};

// A tab as the client renders it: presentation metadata plus the already-flattened transcript
// lines (the server owns `flattenBuffer`, so the client never needs it).
export type TabView = {
  label: string;
  number: number;
  dotColor: string;
  group: number;
  groupColor: string;
  busy: boolean;
  // True when the tab has unseen output (see Tab.hasUnread). Drives the tab-strip badge.
  hasUnread: boolean;
  cwd: string;
  // Identifiers of this tab's currently-active flags (e.g. 'workspaced', 'autoApprove'), for the
  // metadata row's flag-emoji display. Empty when none are active.
  flags?: string[];
  // provider/model of a connected ACP agent on this tab, if any.
  acp?: string;
  connections: ConnectionView[];
  schedule: ScheduleView[];
  bufferLines: BufferLine[];
  cmdHistory: string[];
  commandQueue: string[];
  toolStepsExpanded: boolean;
  // Body kind: undefined/`'agent'` for a normal tab, `'image'` for an image view, `'page'` for an embedded web page, `'harness'` for a full-tab AI harness terminal, `'markdown'` for a rendered Markdown file, `'monitor'` for the AI-monitor suggestion feed, `'files'` for a file tree, `'notifications'` for the notification feed.
  view?: 'agent' | 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'monitor' | 'files' | 'notifications';
  // Display name when it differs from `label` (image tabs are all titled `image`).
  title?: string;
  // Image-view payload, present only when `view === 'image'`.
  image?: ImageView;
  // Page-view payload, present only when `view === 'page'`.
  page?: PageView;
  // Harness-view payload, present only when `view === 'harness'`.
  harness?: HarnessView;
  // Markdown-view payload, present only when `view === 'markdown'`.
  markdown?: MarkdownView;
  // Editor-view payload, present only when `view === 'editor'`.
  editor?: EditorView;
  // Monitor-window payload, present only when `view === 'monitor'`: the suggestion feed, the
  // persona name, the monitored tabs/groups (pre-formatted), and the running total of bytes
  // sent/received on the monitor's dedicated ACP session.
  monitor?: { suggestions: SuggestionView[]; persona: string; targets: string; contextBytes: number };
  // File-tree payload, present only when `view === 'files'`.
  files?: FileTreeView;
  // Set while a full-tab interactive PTY (htop, vim, etc.) is running on this agent tab.
  // Cleared on exit; the client hides the transcript while this is set.
  activePty?: string;
  // Set when this tab is docked into a sidebar instead of living in the central tab strip.
  // Absent means center. A docked tab is never the active tab. See product/specs/sidebars.md.
  dock?: 'left' | 'right';
};

export type StateEvent = {
  t: 'state'; tabs: TabView[]; activeTab: number; route: RouteChooserView | null;
  // The open "New harness" launch dialog, or null when it is closed.
  harnessLaunch: HarnessLaunchView | null;
  tabNameMaxLength: number;
  globalHistory: string[];
  syntaxTheme: string;
  theme: string;
  tasks: TaskRow[];
  // Absolute path of the Janissary install's `ai/tasks` directory, used to build the `execute`
  // command for a built-in (Janissary-source) task row.
  janissaryTasksDir: string;
  profiles: string[];
  // Absolute path of the project directory the server was started against. Drives the titlebar.
  projectDir: string;
  // App version (semver only, e.g. "0.5.4"). Drives the titlebar.
  version: string;
};
export type PtyDataEvent = { t: 'pty'; id: string; data: string };
export type PtyExitEvent = { t: 'pty-exit'; id: string; exitCode: number };
export type RpcReply = { t: 'rpc-reply'; id: number; result?: unknown; error?: string };
// Tells the client to close its window; the server then stops (the `quit`/`exit` command).
export type ByeEvent = { t: 'bye' };
export type ServerEvent = StateEvent | PtyDataEvent | PtyExitEvent | RpcReply | ByeEvent;

// Client -> server requests. Tab creation/closing flow through `command` (`agent`, `close`);
// `setActiveTab`/`moveTab`/`toggleCollapse` are pure-UI shortcuts.
export type RpcCall =
  | { method: 'init'; params?: Record<string, never> }
  | { method: 'command'; params: { text: string } }
  | { method: 'setActiveTab'; params: { index: number } }
  | { method: 'closeTab'; params: { index: number } }
  | { method: 'renameTab'; params: { index: number; title: string } }
  // Patch or remove one entry in the active tab's command queue (see `queue.md`). Index-based
  // against that tab's queue; no-ops server-side when the index is out of range.
  | { method: 'editQueuedCommand'; params: { index: number; text: string } }
  | { method: 'deleteQueuedCommand'; params: { index: number } }
  | { method: 'moveTab'; params: { dir: -1 | 1 } }
  | { method: 'reorderTab'; params: { dir: -1 | 1 } }
  | { method: 'toggleCollapse'; params?: Record<string, never> }
  | { method: 'chooseRoute'; params: { index: number } }
  // Close the "New harness" launch dialog without launching (Cancel/Escape).
  | { method: 'closeHarnessLaunch'; params?: Record<string, never> }
  | { method: 'complete'; params: { text: string; cursor: number } }
  | { method: 'resize'; params: { cols: number; rows: number } }
  | { method: 'ptyInput'; params: { id: string; data: string } }
  | { method: 'ptyResize'; params: { id: string; cols: number; rows: number } }
  | { method: 'ptyKill'; params: { id: string } }
  // Run a monitor suggestion's command in the tab the suggestion is about. The
  // suggestion stays in the feed.
  | { method: 'runSuggestion'; params: { id: string } }
  // Rate a suggestion 👍/👎; feedback reaches the monitoring AI on its next batch and
  // the suggestion is removed from the feed (either direction).
  | { method: 'rateSuggestion'; params: { id: string; up: boolean } }
  // Reset a monitor's reporting tab to just its persona context (discards accumulated
  // conversation on its dedicated ACP session).
  | { method: 'resetMonitorContext'; params: { name: string } }
  // Open a point-in-time snapshot of a monitor's accumulated ACP context in an editor tab.
  | { method: 'monitorContextSnapshot'; params: { name: string } }
  // Write an editor tab's buffer back to disk. `url` is the tab's `/open/<id>` ref — the server
  // resolves it through the open-file allow-list, so only explicitly opened files are writable.
  | { method: 'saveFile'; params: { url: string; content: string } }
  // Sync an editor tab's in-progress (unsaved) buffer to the server as transient draft
  // state, debounced client-side after typing pauses. Never written to disk — see saveFile
  // for that. `url` identifies the tab the same way saveFile's does.
  | { method: 'editorSync'; params: { url: string; content: string } }
  // Sync a page tab's currently visible text, relayed by the bundled extension's content script
  // through the app's message-listener. Never persisted or sent to any client — see `pageSnapshot`.
  // `url` identifies the page tab the same way its `page.url` field does.
  | { method: 'pageSync'; params: { url: string; text: string } }
  // Expand/collapse one directory row in a file tree tab. `index` is the tab's position in the
  // server's full tab list (resolved to a label server-side); `path` is the row's tree-relative path.
  | { method: 'fileTreeToggle'; params: { index: number; path: string } }
  // Collapse every expanded directory in a file tree tab back to just its root.
  | { method: 'fileTreeCollapseAll'; params: { index: number } }
  // Re-root a file tree tab to the parent directory.
  | { method: 'fileTreeReroot'; params: { index: number; path?: string } }
  // Move a file or directory in a file tree tab into a different directory (drag-and-release).
  // `fromRelPath` is the dragged item's tree-relative path; `toRelPath` is the destination
  // directory's tree-relative path.
  | { method: 'moveFileTreeItem'; params: { index: number; fromRelPath: string; toRelPath: string } }
  // Delete a file or directory (recursively) from a file tree tab, after the client has already
  // confirmed with the user. `relPath` is the tree-relative path of the row being removed.
  | { method: 'deleteFileTreeItem'; params: { index: number; relPath: string } }
  // Undo/redo the most recent move in a file tree tab's per-tab undo/redo stack. `overwrite`
  // retries a pending entry after the client has confirmed an overwrite of a conflicting
  // destination; the reply's `result` carries `{ conflict }` when one is found instead.
  | { method: 'undoFileTreeItem'; params: { index: number; overwrite?: boolean } }
  | { method: 'redoFileTreeItem'; params: { index: number; overwrite?: boolean } }
  // Dock a dockable tab (file tree or notifications) into a sidebar (`'left'` | `'right'`), or
  // undock it back to the center tab strip (`null`). Explicit set, not "cycle" — the cycle order
  // lives client-side. The handler is generic, so both dockable tab kinds share this one RPC.
  | { method: 'setDock'; params: { index: number; dock: 'left' | 'right' | null } }
  // Open a file navigator rooted at the named tab's cwd, triggered by the 📁 button in a
  // harness/agent tab's metadata row. If a file-tree tab is already open, its root is retargeted
  // to that cwd in place; otherwise a fresh one opens docked in the left sidebar. Either way the
  // resulting file-tree tab is focused. `label` is the requesting tab's own label.
  | { method: 'openFileNavigatorFor'; params: { label: string } }
  // Launch a new agent tab whose working directory is the named tab's cwd, triggered by the ➕
  // button in a harness/agent tab's metadata row. The new agent is auto-named from the pool, joins
  // the source tab's group, and is focused. `label` is the requesting tab's own label.
  | { method: 'launchAgentFor'; params: { label: string } };

export type ClientMessage = { t: 'rpc'; id: number } & RpcCall;

