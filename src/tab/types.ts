export type LogEntry = {
  input: string;
  output: string;
  running?: boolean;
  cwd?: string;
  // Set when this entry is a cross-agent message from another agent.
  from?: string;
  fromColor?: string;
  msgKind?: 'info' | 'request' | 'response';
  // Set when this entry is an auto-ran agent command (e.g. ACP db loop).
  acp?: boolean;
  // Set when this entry's output is Markdown (an ACP agent reply): the renderer keeps it as one
  // block and interprets the Markdown rather than splitting it into plain text lines.
  markdown?: boolean;
  // Set when this entry hosts an inline terminal card (an interactive program or AI harness
  // running in a PTY). Used by the web renderer to mount an xterm.js pane. `ptyId` keys the live PTY stream.
  terminal?: TerminalEntry;
  // Absolute path of a file to open in an editor tab when the rendered line is clicked (e.g. an
  // auto-approved permission prompt's screen capture).
  openFile?: string;
  openTab?: string;
};

export type TerminalEntry = {
  ptyId: string;
  program: string;
  status: 'running' | 'exited';
  exitCode?: number;
};

export type MessageRenderKind = 'info' | 'request' | 'response';

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer' | 'message' | 'collapsed' | 'terminal' | 'markdown';
  text: string;
  cwd?: string;
  from?: string;
  fromColor?: string;
  msgKind?: MessageRenderKind;
  acp?: boolean;
  // A shell command still in flight: the prompt line and its `Running...` indicator line.
  running?: boolean;
  // Populated for `type: 'terminal'` lines.
  terminal?: TerminalEntry;
  // Absolute path of a file to open in an editor tab when this line is clicked (see `LogEntry.openFile`).
  openFile?: string;
  openTab?: string;
};

// An in-app file view mounted in a tab instead of the agent transcript/command-line body. Image
// tabs (opened via `open <image>`) use `view: 'image'` and carry an `image` payload; ordinary agent
// tabs leave `view` undefined.
// Full-tab AI coding harness view (opened via `harness <name>`); the body is a live PTY terminal.
// An ssh tab (opened via `ssh <destination>`) reuses this same shape, recognized by
// `name === 'ssh'`: `destination` carries the connection identity for the connections panel.
export type HarnessView = {
  name: string; program: string; ptyId: string; status: 'running' | 'exited' | 'provisioning'; exitCode?: number;
  destination?: string; model?: string; effort?: string;
  // Set only when a `-w` launch's workspace clone fails; the tab closes shortly after.
  provisionError?: string;
};

export type ImageView = {
  // Display name (basename), e.g. "diagram.png".
  name: string;
  // Absolute path of the file (the "location").
  path: string;
  // Human-readable file size, e.g. "1.4 MB".
  size: string;
  // App-relative ref the web client loads to fetch the image bytes (see the `/open/<id>` route).
  url: string;
};

// Embedded web page view (opened via `open https://…` or `open page …`); renders an iframe.
// `url`: URL loaded in the iframe; `domain`: registrable domain for the display name;
// `number`: 1-based page number shown in the tab title (e.g. "1) slashdot.org").
export type PageView = { url: string; domain: string; number: number };

export type MarkdownView = {
  name: string;
  path: string;
  size: string;
  url: string;
};

// Plain-text editor view (opened via `open <file>` for text extensions, or `edit <file>` for any
// file). Same shape as MarkdownView: metadata for the header plus the `/open/<id>` content ref.
export type EditorView = {
  name: string;
  path: string;
  size: string;
  url: string;
  // 1-based target line to jump to on open (from a `file:line` transcript link); undefined
  // when opened without a specific line.
  line?: number;
  // On-disk mtime, bumped only when the file changes on disk outside the app (own saves move
  // the watcher's baseline forward first, so they never show up here). The client diffs this
  // against its previous value to detect an external change.
  mtimeMs?: number;
  // Set when this editor was opened on a path that did not exist on disk at open time, and
  // cleared once the buffer is saved. Drives the new-file-only save auto-suffix, de-dupe bypass,
  // and rename-sets-filename behavior (see the new-text-file-button plan).
  newFile?: boolean;
  // Set only for a file whose project-relative path is config-listed for GitHub syncing (see
  // `git-sync.ts`); absent entirely for an ordinary editor tab, so the sync status icon simply
  // doesn't render. `provisioning` covers the shared sync workspace's first-open clone/pull;
  // `syncing` covers an in-flight save-triggered commit/pull-rebase/push cycle.
  sync?: 'provisioning' | 'syncing' | 'synced' | 'error';
};

// A single visible row in a file navigator tab (opened via `files [path]`). `path` is relative to the
// tree root — the unique key, and the argument passed to `open`/`edit` when a file row is clicked.
// Children of a directory are included only once it is expanded (present in the row list at all).
export type FileNavigatorRow = {
  path: string;
  name: string;
  depth: number;
  dir: boolean;
  expanded?: boolean;
  // Set when git considers this row changed. For a file row: its own git status — 'changed' for a
  // modified-but-unstaged or untracked file, 'staged', or 'conflict' for an unmerged path. For a
  // directory row: the highest-priority status (conflict > staged > changed) found among the
  // files beneath it, at any depth. Drives yellow/green/red coloring respectively.
  gitStatus?: 'changed' | 'staged' | 'conflict';
};

// A file navigator view (opened via `files [path]`). The server owns the tree — `rows` is the
// pre-flattened, already-sorted, currently-visible row list; the client never walks directories.
// `root` is display-abbreviated for the header; `absoluteRoot` is the same root unshortened, used
// client-side to resolve a dragged row's path relative to another tab's cwd. `branch` is the
// current git branch when the root sits inside a git repository, undefined otherwise.
// `waitingFor`, when set, is the absolute path the navigator is polling for (not yet created);
// `rows` stays empty until it appears.
export type FileNavigatorView = {
  root: string; absoluteRoot: string; rows: FileNavigatorRow[]; branch?: string;
  // GitHub commits-page URL for the current origin/branch (see `github-url.ts`); undefined when
  // there's no github.com origin remote.
  githubUrl?: string;
  waitingFor?: string;
};

// A single row in the task picker's listing (executable `ai/*.md` prompts). Unlike `FileNavigatorRow`,
// this always contains the *full* recursive tree — the task list needs no live filesystem
// watching, so expand/collapse is purely a client-side concern and carries no `expanded` field.
export type TaskRow = { path: string; name: string; depth: number; dir: boolean; source: 'project' | 'janissary' };

// A monitor target: a single tab by label, or a whole tab group by number (group targets
// track membership dynamically — tabs added to the group later are covered).
export type MonitorTarget =
  | { kind: 'tab'; label: string }
  | { kind: 'group'; group: number };

// One AI-monitor suggestion: produced by a persona-primed monitoring ACP session, shown either
// inline in an agent tab's transcript or in the monitor reporting tab's feed.
export type MonitorSuggestion = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  persona: string;
  // The tab whose activity prompted the suggestion (where "Run" executes).
  about: string;
};

export type Tab = {
  label: string;
  dotColor: string;
  number: number;
  // The tab's body kind. Undefined/`'agent'` renders the normal transcript + command line; `'image'`
  // renders the image view (no command bar). View tabs are live and in-memory — not persisted.
  view?: 'agent' | 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'monitor' | 'files' | 'notifications' | 'schedules';
  // Display name shown in the tab strip when it differs from the (unique) internal `label` — e.g.
  // every image tab is titled `image` while keeping a distinct label (`image`, `image-2`, …).
  title?: string;
  // Set while an interactive PTY (htop, vim, etc.) is running full-tab on this agent tab.
  // Cleared when the process exits, restoring the transcript view.
  activePty?: string;
  // The image-view payload, present only when `view === 'image'`.
  image?: ImageView;
  // The page-view payload, present only when `view === 'page'`.
  page?: PageView;
  // The harness-view payload, present only when `view === 'harness'`.
  harness?: HarnessView;
  // The markdown-view payload, present only when `view === 'markdown'`.
  markdown?: MarkdownView;
  // The editor-view payload, present only when `view === 'editor'`.
  editor?: EditorView;
  // Transient, unsaved buffer content synced from the client shortly after typing pauses
  // (see editor-live-buffer-sync plan). In-memory only; never sent to any client (not part
  // of TabView) and never read when building persisted AgentState. Cleared on save.
  editorDraft?: { content: string; updatedAt: number };
  // Transient cache of a page tab's visible-viewport text, kept fresh out of band by the bundled
  // extension's content script via the `pageSync` RPC (see monitor-page-tab-content-feed plan).
  // In-memory only; never sent to any client (not part of TabView) and never read when building
  // persisted AgentState.
  pageSnapshot?: { text: string; capturedAt: number };
  // The monitor-window payload, present only when `view === 'monitor'`: the suggestion feed,
  // the persona name, the monitored tabs/groups (pre-formatted), and the running total of bytes
  // sent/received on the monitor's dedicated ACP session.
  monitor?: { suggestions: MonitorSuggestion[]; persona: string; targets: string; contextBytes: number };
  // The file navigator payload, present only when `view === 'files'`.
  files?: FileNavigatorView;
  // Group number, shared by an agent and every agent it (transitively) creates. The root agent
  // is group 1; a launched profile forms its own group.
  group: number;
  // The group's bar color, fixed when the group is first assigned (the color of its first
  // agent). Stored per tab so it never shifts when tabs are moved or a group member is closed.
  groupColor: string;
  log: LogEntry[];
  cmdHistory: string[];
  cmdHistoryIdx: number;
  scrollOffset: number;
  workspaceDir?: string;
  // `--offline` on the tab's creating `agent`/`harness` command: adds a network-deny rule to the
  // tab's sandbox profile (only meaningful alongside `workspaceDir`). Kept so a relaunch restores it.
  offline?: boolean;
  // Whether harness auto-permitting (auto-approving the harness's own permission prompts) is
  // enabled on this tab. Harness-only; set once at spawn time.
  autoApprove?: boolean;
  // When false/undefined, contiguous runs of auto-run agent tool steps (acp entries) are
  // collapsed into a single summary line in the transcript. Toggled with Ctrl+T. In-memory
  // only (like scrollOffset) — not persisted to agent state.
  toolStepsExpanded?: boolean;
  // Set when new transcript content arrives on this tab while it is NOT the active tab; cleared
  // when the tab is activated. Drives the unread badge in the tab strip. In-memory only (like
  // scrollOffset) — not persisted to agent state.
  hasUnread?: boolean;
  // Set when this tab is docked into a sidebar instead of living in the central tab strip.
  // Absent means center (today's only behavior) — the zero value, no migration needed. A docked
  // tab stays in `tabs[]` (every index-keyed RPC still addresses it) but is never the active tab
  // and is not rendered in the strip; see product/specs/sidebars.md. In-memory only — not persisted.
  dock?: 'left' | 'right';
};
