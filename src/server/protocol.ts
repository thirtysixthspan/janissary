// Wire types shared between the Node server and the React web client. The web bundle mirrors
// these locally (it cannot import across the bundler boundary cleanly), so keep them in sync.
import type { BufferLine } from '../types.js';

export type { BufferLine };

// One row in the floating "connections" panel (shell / acp / terminal card / sqlite).
export type ConnectionView = { text: string; kind: 'shell' | 'acp' | 'browser' | 'terminal' | 'sqlite' };
// One row in the floating "schedule" panel.
export type ScheduleView = { id: string; spec: string; next: string; recurring: boolean };

// A tab as the client renders it: presentation metadata plus the already-flattened transcript
// lines (the server owns `flattenBuffer`, so the client never needs it).
export type TabView = {
  label: string;
  number: number;
  dotColor: string;
  group: number;
  groupColor: string;
  busy: boolean;
  cwd: string;
  // Name of a running AI harness on this tab, if any (for the tab-strip marker).
  harness?: string;
  // provider/model of a connected ACP agent on this tab, if any.
  acp?: string;
  connections: ConnectionView[];
  schedule: ScheduleView[];
  bufferLines: BufferLine[];
  cmdHistory: string[];
  toolStepsExpanded: boolean;
};

export type StateEvent = { t: 'state'; tabs: TabView[]; activeTab: number };
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
  | { method: 'moveTab'; params: { dir: -1 | 1 } }
  | { method: 'reorderTab'; params: { dir: -1 | 1 } }
  | { method: 'toggleCollapse'; params?: Record<string, never> }
  | { method: 'complete'; params: { text: string; cursor: number } }
  | { method: 'resize'; params: { cols: number; rows: number } }
  | { method: 'ptyInput'; params: { id: string; data: string } }
  | { method: 'ptyResize'; params: { id: string; cols: number; rows: number } }
  | { method: 'ptyKill'; params: { id: string } };

export type ClientMessage = { t: 'rpc'; id: number } & RpcCall;
