// Wire types shared between the Node server and the React web client.
// The web client imports these directly via the @shared path alias — no mirror needed.
import type { BufferLine, ImageView, PageView, HarnessView, MarkdownView, TerminalEntry, CompletionResult } from './types.js';

// Used locally in TabView below, so separate import + export is required.
// eslint-disable-next-line unicorn/prefer-export-from
export type { BufferLine, ImageView, PageView, HarnessView, MarkdownView, TerminalEntry, CompletionResult };

// One row in the floating "connections" panel (shell / acp / terminal card / sqlite).
export type ConnectionView = { text: string; kind: 'shell' | 'acp' | 'browser' | 'terminal' | 'sqlite' };
// One row in the floating "schedule" panel.
export type ScheduleView = { id: string; spec: string; next: string; recurring: boolean };
// A pending route chooser: the unprefixed command plus the option labels to pick from.
export type RouteChooserView = { cmd: string; choices: string[] };

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
  // provider/model of a connected ACP agent on this tab, if any.
  acp?: string;
  connections: ConnectionView[];
  schedule: ScheduleView[];
  bufferLines: BufferLine[];
  cmdHistory: string[];
  toolStepsExpanded: boolean;
  // Body kind: undefined/`'agent'` for a normal tab, `'image'` for an image view, `'page'` for an embedded web page, `'harness'` for a full-tab AI harness terminal, `'markdown'` for a rendered Markdown file, `'monitor'` for the AI-monitor suggestion feed.
  view?: 'agent' | 'image' | 'page' | 'harness' | 'markdown' | 'monitor';
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
  // Monitor-window payload, present only when `view === 'monitor'`: the suggestion feed.
  monitor?: { suggestions: SuggestionView[] };
  // Set while a full-tab interactive PTY (htop, vim, etc.) is running on this agent tab.
  // Cleared on exit; the client hides the transcript while this is set.
  activePty?: string;
};

export type StateEvent = { t: 'state'; tabs: TabView[]; activeTab: number; route: RouteChooserView | null };
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
  | { method: 'moveTab'; params: { dir: -1 | 1 } }
  | { method: 'reorderTab'; params: { dir: -1 | 1 } }
  | { method: 'toggleCollapse'; params?: Record<string, never> }
  | { method: 'chooseRoute'; params: { index: number } }
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
  | { method: 'rateSuggestion'; params: { id: string; up: boolean } };

export type ClientMessage = { t: 'rpc'; id: number } & RpcCall;

