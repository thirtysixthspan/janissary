export const SHELL_PAYLOAD_SCHEMA_VERSION = 2;

// The zsh binary this plugin spawns, named outright rather than taken from `$SHELL`: the tab is a
// zsh tab whatever the user's login shell happens to be, which is what makes `zsh` an honest command
// name for it. Spawned with no arguments at all, so the user's rc files load — a terminal that
// ignored `.zshrc` would have no PATH additions, no aliases, and no prompt of the user's own.
export const SHELL_PROGRAM = '/bin/zsh';

// One row of a connection or schedule window, re-declared rather than imported from `@shared/protocol`
// because this module must import nothing: the client executes these guards through `@shared`, and an
// import could pull NodeNext resolution into the browser graph. `shared.test.ts` pins these two
// against the protocol's own shapes, the way the sessions plugin's does.
export type ShellConnectionKind =
  | 'shell' | 'acp' | 'ssh' | 'browser' | 'terminal' | 'sqlite';

// A discriminated union, as the protocol's own is: a tab-scoped reference names only its tab, and an
// editor-scoped one names a persona too. Flattening that into one optional field would make a row that
// claims an editor scope without a persona expressible, which the protocol deliberately is not.
export type ShellAcpRef =
  | { scope: 'tab'; label: string }
  | { scope: 'editor'; label: string; persona: string };

export type ShellConnectionRow = {
  text: string;
  kind: ShellConnectionKind;
  acpRef?: ShellAcpRef;
};

export type ShellScheduleRow = {
  id: string;
  spec: string;
  next: string;
  recurring: boolean;
};

export type ShellPayload = {
  instanceKey: string;
  // The pseudo-terminal this tab owns. The host keeps the process; this is the handle its client
  // attaches to, and the id never reaches any other plugin.
  ptyId: string;
  // The shell's current working directory, updated by zsh's cwd markers and displayed in the
  // metadata row. The root and workspace context below stay fixed for the life of this shell.
  cwd: string;
  // The project root and workspace clone are display context only; `cwd` remains the absolute path
  // all shell actions and cwd updates use.
  root: string;
  workspaceDir?: string;
  workspace: boolean;
  cols: number;
  rows: number;
  // Pushed by the host when they change, and empty until it does. A tab's first payload is empty
  // here by design: a plugin cannot read host state, so the windows it renders fill in afterwards.
  connections: ShellConnectionRow[];
  schedule: ShellScheduleRow[];
  commandRunning?: boolean;
  // The nonce the shell's status hooks were installed with. Absent until the first client to attach
  // claims the install, then fixed for the life of the terminal: a later attach re-uses it rather
  // than typing the setup line into whatever program holds the foreground.
  hookNonce?: string;
};

export type ShellIntent = 'terminal-status' | 'dispatch' | 'complete' | 'cwd' | 'queue' | 'dequeue';

// The front of this tab's command queue, or `null` once it is empty.
export type ShellQueuedLine = { line: string | null };

export type ShellTerminalStatus = { running: boolean };

// What the host decided about one line: `dispatched` is true when the application claimed it as a
// command, false when it resolved to nothing and the shell should have it. The client writes a
// `false` line to the terminal itself — the decision is the host's, because the command table is.
export type ShellDispatchResult = { dispatched: boolean; output: string };

// The completion the application's command bar would show. Carried by the same intent rather than a
// second one, so a plugin holding a ptyId and a command line needs exactly one wire route.
export type ShellCompleteRequest = { line: string; cursor: number };
export type ShellCommandState = { running: boolean };

// The answer to an `install-hooks` claim: `install` is true for exactly one claimant, and `nonce` is
// the one the installed hooks sign their markers with, whichever client minted it.
export type ShellHookClaim = { install: boolean; nonce: string };

// An absolute path already in normal form: no empty, `.` or `..` segment and no trailing slash beyond
// the root itself. zsh's `$PWD` is always written that way, so a real report never trips this, while
// a crafted one such as `/repo/a/../../etc` would otherwise read as inside the project to any check
// that compares the written path rather than the resolved one.
export function isShellCwd(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/')) return false;
  if (value === '/') return true;
  return value.slice(1).split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

// The completion the application's own command bar shows, re-declared for the same import-free reason
// as the rows above. `matches`, `newInput` and `newCursor` are the application's own shape: a single
// match is the completed text, several are a strip to choose from, and none leaves the bar alone.
export type ShellCompletion = {
  matches: string[];
  newInput: string;
  newCursor: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONNECTION_KINDS: ReadonlySet<string> = new Set([
  'shell', 'acp', 'ssh', 'browser', 'terminal', 'sqlite',
]);

function isAcpRef(value: unknown): value is ShellAcpRef {
  if (!isRecord(value) || typeof value.label !== 'string') return false;
  if (value.scope === 'tab') return true;
  return value.scope === 'editor' && typeof value.persona === 'string';
}

function isConnectionRow(value: unknown): value is ShellConnectionRow {
  if (!isRecord(value)) return false;
  if (typeof value.text !== 'string') return false;
  if (typeof value.kind !== 'string' || !CONNECTION_KINDS.has(value.kind)) return false;
  return value.acpRef === undefined || isAcpRef(value.acpRef);
}

function isScheduleRow(value: unknown): value is ShellScheduleRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.spec === 'string'
    && typeof value.next === 'string'
    && typeof value.recurring === 'boolean';
}

// The shape `createShellMarkerNonce` mints: 16 random bytes as lowercase hex. Checked because the
// nonce is written into the hook functions zsh runs, so nothing else may stand in for one.
export function isShellMarkerNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

export function isShellPayload(value: unknown): value is ShellPayload {
  return isRecord(value)
    && typeof value.instanceKey === 'string'
    && typeof value.ptyId === 'string'
    && typeof value.cwd === 'string'
    && typeof value.root === 'string'
    && (value.workspaceDir === undefined || typeof value.workspaceDir === 'string')
    && typeof value.workspace === 'boolean'
    && typeof value.cols === 'number'
    && typeof value.rows === 'number'
    && Array.isArray(value.connections)
    && value.connections.every(isConnectionRow)
    && Array.isArray(value.schedule)
    && value.schedule.every(isScheduleRow)
    && (value.commandRunning === undefined || typeof value.commandRunning === 'boolean')
    && (value.hookNonce === undefined || isShellMarkerNonce(value.hookNonce));
}

// The one intent that carries no payload at all, so absent and null are the only two shapes that can
// be right. Anything else is a request this plugin did not describe, and is rejected rather than ignored.
export function isEmptyShellIntent(value: unknown): value is undefined {
  return value === undefined || value === null;
}

// The two request shapes the wire carries. Both are guards rather than bare types so a malformed one
// is a rejection — a request this plugin did not describe — instead of a silent success.
export function isShellDispatch(value: unknown): value is string {
  return typeof value === 'string';
}

export function isShellCompleteRequest(value: unknown): value is ShellCompleteRequest {
  return isRecord(value)
    && typeof value.line === 'string'
    && typeof value.cursor === 'number';
}

export function isShellCommandState(value: unknown): value is ShellCommandState {
  return isRecord(value) && typeof value.running === 'boolean';
}

export function isTerminalStatus(value: unknown): value is ShellTerminalStatus {
  return isRecord(value) && typeof value.running === 'boolean';
}
