// Shared type declarations for the top-level `src/` modules. Types live here rather than
// alongside their implementations so each directory has a single types file (the
// `src/commands/` directory has its own `commands/types.ts`). Runtime values (functions,
// constants) stay in their respective modules; only types are collected here.

import type { ChildProcess } from 'node:child_process';
import type { Command, CommandHandlerContext } from './commands/types.js';

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
};

export type MessageRenderKind = 'info' | 'request' | 'response';

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer' | 'message' | 'collapsed';
  text: string;
  cwd?: string;
  from?: string;
  fromColor?: string;
  msgKind?: MessageRenderKind;
  acp?: boolean;
};

export type Tab = {
  label: string;
  dotColor: string;
  number: number;
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
  // When false/undefined, contiguous runs of auto-run agent tool steps (acp entries) are
  // collapsed into a single summary line in the transcript. Toggled with Ctrl+T. In-memory
  // only (like scrollOffset) — not persisted to agent state.
  toolStepsExpanded?: boolean;
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
  workspaceDir?: string;
  schedule?: ScheduleEntry[];
};

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

export type ScheduleParseResult =
  | { action: 'add'; entry: Omit<ScheduleEntry, 'id'>; name: string }
  | { action: 'list' }
  | { action: 'cancel'; id: string }
  | { action: 'clear' }
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
  runCommand: (cmd: string) => string | Promise<string>;
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
  ranCommand: (cmd: string, result: string) => void;
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

export type Message = {
  id: number;
  from: string;
  to: string;
  kind: MessageKind;
  text: string;
};

export type ParsedMsg = { to: string; kind: MessageKind; text: string };

export type ParsedBroadcast = { targets: string[] | 'all'; kind: MessageKind; text: string };

export type MessagingDeps = {
  hasAgent: (label: string) => boolean;
  agentColor: (label: string) => string;
  // Whether a command needs an interactive PTY (those cannot be run on behalf of a
  // non-foreground agent and are rejected).
  isInteractive: (cmd: string) => boolean;
  appendLog: (label: string, entry: LogEntry) => void;
  appendContext: (label: string, text: string) => void;
  // Run a shell command in the recipient's own persistent shell, streaming output to its
  // transcript, and invoke onComplete with the final output.
  runShell: (label: string, cmd: string, onComplete: (output: string) => void) => void;
  // Execute text in the recipient's window (built-ins + shell, interactive commands
  // skipped) capturing the output instead of displaying it. Used to fulfil a request.
  runCapture: (label: string, text: string, onResult: (output: string) => void) => void;
};

export type Messaging = {
  /** Enqueue a message for delivery. Returns false if the recipient does not exist. */
  send: (msg: Omit<Message, 'id'>) => boolean;
};

// --- connections.ts -------------------------------------------------------

export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser';

export type ConnectionParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string };

// --- commands.ts ----------------------------------------------------------

export type AgentCommand = {
  name: string;
  workspace: boolean;
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

export type AppCommand = Command['name'];

export type Resolution =
  | { kind: 'empty' }
  | { kind: 'shell'; cmd: string }
  | { kind: 'app'; name: AppCommand; cmd: string }
  | { kind: 'output'; cmd: string; output: string };

// --- command-handler.ts ---------------------------------------------------

export type CommandHandlerDeps = CommandHandlerContext;

// --- config.ts ------------------------------------------------------------

export type Config = {
  transcriptMaxLines: number;
};

// --- completion.ts --------------------------------------------------------

export type CompletionResult = {
  newInput: string;
  newCursor: number;
  matches: string[];
};

// --- interactive.ts -------------------------------------------------------

export type InteractiveSession = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};

export type RunInteractiveOptions = {
  cmd: string;
  cwd?: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
};

// --- scroll.ts ------------------------------------------------------------

export type ScrollAccel = { dir: number; start: number; last: number };

export type AccelOptions = {
  // Max gap (ms) between ticks that still counts as continuous scrolling.
  gapMs?: number;
  // The step grows by one every `rampMs` of continuous scrolling.
  rampMs?: number;
  // Upper bound on the step size.
  maxStep?: number;
};

// --- theme.ts -------------------------------------------------------------

export type ThemeColors = {
  bg: string;
  bgSoft: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
};

// --- useShellManager.ts ---------------------------------------------------

export type ShellManager = {
  shellsRef: { current: Map<number, ChildProcess> };
  cwdRef: { current: Record<string, string> };
  shellActive: Record<number, boolean>;
  setShellActive: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  getShell: (tabIndex: number, label?: string) => ChildProcess | null;
};

// --- shell.ts -------------------------------------------------------------

export type ShellCmdCallbacks = {
  onProgress: (outputBuffer: string) => void;
  onComplete: (result: string) => void;
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

// --- useInputHandler.ts ---------------------------------------------------

export type InputHandlerDeps = {
  input: string;
  cursor: number;
  setInput: (fn: ((prev: string) => string) | string) => void;
  setCursor: (fn: ((prev: number) => number) | number) => void;
  tabs: Tab[];
  activeTab: number;
  setTabs: (updater: (prev: Tab[]) => Tab[]) => void;
  setActiveTab: (fn: ((prev: number) => number) | number) => void;
  updateCurrentTab: (updater: (tab: Tab) => Tab) => void;
  executeRef: { current: ((cmd: string) => void) | null };
  shellsRef: { current: Map<number, ChildProcess> };
  visibleHeight: number;
  exit: () => void;
  historyPickerOpen: boolean;
  historyPickerIdx: number;
  setHistoryPickerOpen: (open: boolean) => void;
  setHistoryPickerIdx: (fn: ((prev: number) => number) | number) => void;
  frequentHistory: string[];
  flashScrollBoundary: () => void;
  interactive: boolean;
  cwd: string;
  agents: string[];
  connections: string[];
};

// --- logger.ts ------------------------------------------------------------

export type LogRecord = {
  timestamp: string;
  agent: string;
  text: string;
};
