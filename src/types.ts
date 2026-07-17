/* eslint-disable max-lines */
// Shared type declarations for the top-level `src/` modules. Types live here rather than
// alongside their implementations so each directory has a single types file (the
// `src/commands/` directory has its own `commands/types.ts`). Runtime values (functions,
// constants) stay in their respective modules; only types are collected here.


// --- tab.ts ---------------------------------------------------------------

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
};

// An in-app file view mounted in a tab instead of the agent transcript/command-line body. Image
// tabs (opened via `open <image>`) use `view: 'image'` and carry an `image` payload; ordinary agent
// tabs leave `view` undefined.
// Full-tab AI coding harness view (opened via `harness <name>`); the body is a live PTY terminal.
// An ssh tab (opened via `ssh <destination>`) reuses this same shape, recognized by
// `name === 'ssh'`: `destination` carries the connection identity for the connections panel.
export type HarnessView = {
  name: string; program: string; ptyId: string; status: 'running' | 'exited'; exitCode?: number;
  destination?: string; model?: string; effort?: string;
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
};

// A single visible row in a file tree tab (opened via `files [path]`). `path` is relative to the
// tree root — the unique key, and the argument passed to `open`/`edit` when a file row is clicked.
// Children of a directory are included only once it is expanded (present in the row list at all).
export type FileTreeRow = {
  path: string;
  name: string;
  depth: number;
  dir: boolean;
  expanded?: boolean;
  // Set when git considers this row changed. For a file row: its own path is modified, staged, or
  // untracked. For a directory row: some file beneath it (at any depth) is. Drives yellow coloring.
  changed?: boolean;
};

// A file tree view (opened via `files [path]`). The server owns the tree — `rows` is the
// pre-flattened, already-sorted, currently-visible row list; the client never walks directories.
// `root` is display-abbreviated for the header; `absoluteRoot` is the same root unshortened, used
// client-side to resolve a dragged row's path relative to another tab's cwd. `branch` is the
// current git branch when the root sits inside a git repository, undefined otherwise.
export type FileTreeView = { root: string; absoluteRoot: string; rows: FileTreeRow[]; branch?: string };

// A single row in the task picker's listing (executable `ai/*.md` prompts). Unlike `FileTreeRow`,
// this always contains the *full* recursive tree — the task list needs no live filesystem
// watching, so expand/collapse is purely a client-side concern and carries no `expanded` field.
export type TaskRow = { path: string; name: string; depth: number; dir: boolean };

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
  view?: 'agent' | 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'monitor' | 'files' | 'notifications';
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
  // The file-tree payload, present only when `view === 'files'`.
  files?: FileTreeView;
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

// --- agent-state.ts -------------------------------------------------------

export type AgentState = {
  name: string;
  dotColor: string;
  active: boolean;
  number?: number;
  group?: number;
  groupColor?: string;
  cmdHistory?: string[];
  log?: { input: string; output: string; running?: boolean }[];
  cwd?: string;
  context?: string[];
  commandQueue?: string[];
  workspaceDir?: string;
  offline?: boolean;
  schedule?: ScheduleEntry[];
  title?: string;
};

// --- profiles.ts (harness entries) -----------------------------------------

// A profile entry describing a harness tab instead of an agent (discriminated by the
// presence of `harness`). `schedule` entries are authored strings in the `schedule` command
// grammar (minus `in <tab>`); `run` entries are commands typed into the harness once, shortly
// after launch.
export type ProfileHarnessEntry = {
  // The tab label: populated by the loader from the filename (minus `.json`), same as an
  // agent entry's `name` — never authored inside the JSON file itself.
  label: string;
  harness: string;
  model?: string;
  // A startup effort level (e.g. "high"), passed through to the harness binary verbatim with no
  // validation against a fixed set (unlike `model`, which is checked against harness-models.json).
  effort?: string;
  number?: number;
  group?: number;
  dotColor?: string;
  workspace?: boolean;
  // `-y`/`--yes`: auto-approve the harness's own permission prompts. Claude-only and requires
  // `workspace` (mirrors `parseHarnessCommand`); an entry that sets it without a claude
  // workspace is reported and skipped at launch rather than opened unsafely.
  autoApprove?: boolean;
  // `--offline`: adds a network-deny rule to the tab's sandbox profile (only meaningful with
  // `workspace`).
  offline?: boolean;
  cwd?: string;
  run?: string[];
  schedule?: string[];
};

export type ProfileEntry = AgentState | ProfileHarnessEntry;

// A profile-level monitor, authored in a profile's reserved `_monitors.json` file (decoupled
// from any single entry). Once every profile entry is open, each is started from the launch's
// issuing tab as `monitor <persona> <targets…>`. `targets` are authored target words in the
// `monitor` grammar (`group:<n>` or a tab label); an empty list is inline mode.
export type ProfileMonitor = { persona: string; targets: string[] };

// A profile-level file-tree tab, authored in a profile's reserved `_files.json` file (mirrors
// `_monitors.json`). `dock` docks it into that sidebar; `in` roots it at the cwd of the named tab
// instead of the profile's first newly opened tab.
export type ProfileFilesEntry = { dock?: 'left' | 'right'; in?: string };

// A profile-level notifications tab, authored in a profile's reserved `_notifications.json` file
// (mirrors `_files.json`). `dock` docks the singleton notifications feed into that sidebar.
export type ProfileNotificationsEntry = { dock?: 'left' | 'right' };

// --- schedule.ts ----------------------------------------------------------

export type TimeOfDay = { hour: number; minute: number };

export type ScheduleEntry = {
  id: string; // 's1', 's2', ...
  command: string; // raw command text to dispatch
  spec: string; // human-readable schedule, e.g. "every 5m", "every day at 3:35pm"
  nextRun: number; // epoch ms of the next execution
  recurring: boolean;
  intervalMs?: number; // interval recurrence
  timeOfDay?: TimeOfDay; // clock-time recurrence
  weekday?: number; // 0-6 (Sun-Sat) when "every <weekday>"
};

// `target` carries the optional `in <tab>` clause: the label of the tab the operation
// applies to (defaulting to the issuing tab when absent).
export type ScheduleParseResult =
  | { action: 'add'; entry: Omit<ScheduleEntry, 'id'>; name: string; target?: string }
  | { action: 'list'; target?: string }
  | { action: 'cancel'; id: string; target?: string }
  | { action: 'clear'; target?: string }
  | { error: string };

// --- acp.ts ---------------------------------------------------------------

export type PromptHandlers = {
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onError: (message: string) => void;
};

export type AcpSession = {
  // Send a prompt and stream the agent's text reply through `handlers`.
  prompt: (text: string, handlers: PromptHandlers) => void;
  kill: () => void;
};

export type AcpInfo = { provider?: string; model?: string };

export type AcpOptions = {
  command: string;
  args: string[];
  cwd: string;
  // Connection-level errors (failed spawn, protocol errors outside a prompt).
  onError: (message: string) => void;
  // Called once the session handshake completes, with the agent's reported identity.
  onConnect?: (info: AcpInfo) => void;
  // Extra environment variables to pass to the subprocess.
  env?: Record<string, string>;
  // When the session belongs to a workspaced tab, confines the ACP subprocess to that workspace
  // via a Seatbelt sandbox (see sandbox.ts). Monitor sessions never set this.
  workspaceDir?: string;
  offline?: boolean;
  // Tool ids the connection's permission handler may approve (see acp-tools.ts). Undefined/empty
  // (every non-monitor caller and every tool-less persona) means deny every tool request.
  allowedTools?: string[];
};

// --- acp-loop.ts ----------------------------------------------------------

export type AcpPromptHandlers = {
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onError: (message: string) => void;
};

// Structural subset of `AcpSession` the loop needs.
export type AcpLoopSession = {
  prompt: (text: string, handlers: AcpPromptHandlers) => void;
};

export type AcpLoopDeps = {
  // Prepended to the first prompt (e.g. the db primer) when starting a new session.
  primer?: string;
  // Execute an extracted command and return its textual output. May be async (e.g. a
  // browser command); the loop awaits the result before continuing.
  runCommand: (command: string) => string | Promise<string>;
  // Pull a runnable command out of an agent reply, or null when there is none.
  extractCommand: (text: string) => string | null;
  // Maximum number of auto-run command steps before stopping (default 8).
  maxSteps?: number;
};

export type AcpLoopHandlers = {
  // A new agent turn is starting; `isFirst` is true only for the opening turn.
  startTurn: (isFirst: boolean) => void;
  // Cumulative streamed text for the current turn.
  chunk: (cumulative: string) => void;
  // The current turn finished with this final text.
  endTurn: (final: string) => void;
  // A command was auto-run; show it and its result.
  ranCommand: (command: string, result: string) => void;
  // The loop ended: `answered` (no command emitted) or `capped` (hit `maxSteps`).
  finished: (reason: 'answered' | 'capped', maxSteps: number) => void;
  // A connection/prompt error occurred.
  error: (message: string) => void;
};

// --- browser.ts -----------------------------------------------------------

export type BrowserWindow = {
  id: string;
  // Navigate to a URL (waits for load); returns a short "title — url" summary.
  goto: (url: string) => Promise<string>;
  // Run JavaScript in the page and return the (JSON-stringified) result.
  eval: (js: string) => Promise<string>;
  // Screenshot the viewport to a temp PNG and (on macOS) open it in Preview; returns the path.
  shot: () => Promise<string>;
  // The page's rendered text (title + body innerText), truncated for agent consumption.
  content: () => Promise<string>;
  // Current page URL, for `connection list` display.
  url: () => string;
};

export type TabBrowser = {
  mode: 'headless' | 'headed';
  openWindow: (id: string) => Promise<BrowserWindow>;
  window: (id: string) => BrowserWindow | undefined;
  closeWindow: (id: string) => Promise<void>;
  windowIds: () => string[];
  close: () => Promise<void>;
};

// --- browser-command.ts ---------------------------------------------------

export type BrowserParsed =
  | { error: string }
  | { action: 'open'; name?: string; headed: boolean }
  | { action: 'list' }
  | { action: 'use'; id: string }
  | { action: 'goto'; url: string }
  | { action: 'eval'; js: string }
  | { action: 'shot' }
  | { action: 'content' }
  | { action: 'close' }
  | { action: 'closeWindow'; id: string };

// --- messaging.ts ---------------------------------------------------------

// `response` is system-generated (the reply to a request), not something a user sends.
export type MessageKind = 'info' | 'request' | 'command' | 'response';

export type ParsedMsg = { to: string; kind: MessageKind; text: string };

export type ParsedBroadcast = { targets: string[] | 'all'; kind: MessageKind; text: string };


// --- connections.ts -------------------------------------------------------

export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser' | 'ssh';

export type ConnectionParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string };

// --- commands.ts ----------------------------------------------------------

export type AgentCommand = {
  name: string;
  workspace: boolean;
  // `--offline`: adds a network-deny rule to the tab's sandbox profile (workspaced tabs only —
  // see sandbox.ts). Ignored (but still parsed and stored) when the tab isn't workspaced.
  offline: boolean;
};

// --- profiles.ts ----------------------------------------------------------

export type ProfileParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'launch'; name: string };

// --- db.ts ----------------------------------------------------------------

export type DbParsed =
  | { error: string }
  | { action: 'create' | 'delete'; name: string }
  | { action: 'list' }
  | { action: 'query'; name: string; query: string };

// --- resolve.ts -----------------------------------------------------------

// A built-in command's name. Mirrors `Command['name']` (a string) without importing from
// `commands/types.ts`, which would create a `types.ts` ↔ `commands/types.ts` import cycle.
export type AppCommand = string;

export type Resolution =
  | { kind: 'empty' }
  | { kind: 'shell'; cmd: string }
  | { kind: 'app'; name: AppCommand; cmd: string }
  | { kind: 'output'; cmd: string; output: string }
  // An unprefixed command that matches no built-in. The interactive dispatcher runs probabilistic
  // recognition on it; other callers fall back to `output` (the unknown-command message).
  | { kind: 'unknown'; cmd: string; output: string };

// --- config.ts ------------------------------------------------------------

// Per-event opt-in toggles for the notifications tab (see `notifications.ts`). Each defaults to
// false; the user enables an event by editing `.janissary/config.json` directly. There is
// deliberately no toggle for the `manual` event (an agent-triggered `notify`), which always fires.
export type NotificationConfig = {
  events: {
    stateChange: boolean;
    incomingMessage: boolean;
    scheduleFire: boolean;
    agentStart: boolean;
    rateLimited: boolean;
  };
};

export type Config = {
  transcriptMaxLines: number;
  tabNameMaxLength: number;
  // Isolate workspaced tabs (`agent --workspace`, `harness --workspace`) to their workspace clone
  // via a Seatbelt sandbox (macOS only). Default true; the escape hatch for when it causes trouble.
  sandboxWorkspaces: boolean;
  // The active syntax-highlighting theme name for editor tabs (see `syntax-themes.ts`), applied
  // globally across every open editor tab.
  syntaxTheme: string;
  // The active application color theme name (see `app-themes.ts`), applied to the whole window
  // chrome. Independent of `syntaxTheme`.
  theme: string;
  // Which background events feed the notifications tab (all opt-in; see `notifications.ts`).
  notifications?: NotificationConfig;
};

// --- completion.ts --------------------------------------------------------

export type CompletionResult = {
  newInput: string;
  newCursor: number;
  matches: string[];
};



// --- user-agent.ts --------------------------------------------------------

export type BrowserProfile = {
  userAgent: string;
  // Value for the `Sec-CH-UA-Platform` client-hint header (and what the UA token implies).
  platform: 'Windows' | 'macOS' | 'Linux';
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
};


// --- logger.ts ------------------------------------------------------------

export type LogRecord = {
  timestamp: string;
  agent: string;
  text: string;
};

export type Sinks = {
  emitState: () => void;
  sendPty: (id: string, data: string) => void;
  sendPtyExit: (id: string, exitCode: number) => void;
  exit?: () => void;
};
