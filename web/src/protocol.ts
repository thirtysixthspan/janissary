// Mirror of src/server/protocol.ts (the bundler boundary prevents a shared import). Keep in sync.

export type TerminalEntry = {
  ptyId: string;
  program: string;
  status: 'running' | 'exited';
  exitCode?: number;
};

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer' | 'message' | 'collapsed' | 'terminal';
  text: string;
  cwd?: string;
  from?: string;
  fromColor?: string;
  msgKind?: 'info' | 'request' | 'response';
  acp?: boolean;
  terminal?: TerminalEntry;
};

export type ConnectionView = { text: string; kind: 'shell' | 'acp' | 'browser' | 'terminal' | 'sqlite' };
export type ScheduleView = { id: string; spec: string; next: string; recurring: boolean };

export type TabView = {
  label: string;
  number: number;
  dotColor: string;
  group: number;
  groupColor: string;
  busy: boolean;
  cwd: string;
  harness?: string;
  acp?: string;
  connections: ConnectionView[];
  schedule: ScheduleView[];
  bufferLines: BufferLine[];
  cmdHistory: string[];
  toolStepsExpanded: boolean;
};

export type ServerEvent =
  | { t: 'state'; tabs: TabView[]; activeTab: number }
  | { t: 'pty'; id: string; data: string }
  | { t: 'pty-exit'; id: string; exitCode: number }
  | { t: 'rpc-reply'; id: number; result?: unknown; error?: string };

export type RpcCall =
  | { method: 'init'; params?: Record<string, never> }
  | { method: 'command'; params: { text: string } }
  | { method: 'setActiveTab'; params: { index: number } }
  | { method: 'moveTab'; params: { dir: -1 | 1 } }
  | { method: 'reorderTab'; params: { dir: -1 | 1 } }
  | { method: 'toggleCollapse'; params?: Record<string, never> }
  | { method: 'resize'; params: { cols: number; rows: number } }
  | { method: 'ptyInput'; params: { id: string; data: string } }
  | { method: 'ptyResize'; params: { id: string; cols: number; rows: number } }
  | { method: 'ptyKill'; params: { id: string } };
