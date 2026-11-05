export const CONNECTIONS_PAYLOAD_SCHEMA_VERSION = 1;

export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser' | 'ssh' | 'terminal';
export type ConnectionStatus = 'Idle' | 'Running' | 'Closed' | 'Completed' | 'Failed' | 'Terminated';
export type ConnectionActivity = { kind: 'message' | 'thought' | 'tool' | 'plan' | 'permission'; text: string; timestamp: number };
export type ConnectionBlock = {
  prompt: string;
  startedAt: number;
  entries: ConnectionActivity[];
  answer?: string;
  endedAt?: number;
};
export type ConnectionSource =
  | { kind: 'acp'; model: string; ownerLabel: string; ownerName: string }
  | { kind: 'agent'; model: string; ownerLabel: string; ownerName: string; runId: string; taskPath: string };

export type ConnectionWindow = {
  id: string;
  source: ConnectionSource;
  blocks: ConnectionBlock[];
  totalBlocks: number;
  offset: number;
  hasOlder: boolean;
};

type ConnectionRowBase = {
  id: string;
  host: string;
  ownerLabel: string;
  ownerName: string;
  orderingTimestamp: number;
  focusTarget?: string;
  acpRef?: { scope: 'tab'; label: string } | { scope: 'monitor'; name: string }
    | { scope: 'editor'; label: string; persona: string };
};

export type LiveConnectionRow = ConnectionRowBase & {
  type: 'live'; kind: ConnectionKind; display: string; status: 'Open'; permanent?: true;
};
export type RecordConnectionRow = ConnectionRowBase & {
  type: 'record'; kind: ConnectionKind | 'agent'; title: string; model: string;
  status: ConnectionStatus; runId?: string; startedAt: number; updatedAt: number; endedAt?: number; window?: ConnectionWindow;
};
export type ConnectionRow = LiveConnectionRow | RecordConnectionRow;

export function recordConnectionName(row: Pick<RecordConnectionRow, 'kind' | 'ownerName'>): string {
  return `${row.kind}:${row.ownerName}`;
}

export type ConnectionsPayload =
  | { kind: 'connection'; record: ConnectionRow }
  | { kind: 'list'; rows: ConnectionRow[] };

export type ConnectionsIntent =
  | { intent: 'open' | 'close'; payload: { kind: ConnectionKind; id: string; ownerLabel: string } }
  | { intent: 'open-record'; payload: { id: string } }
  | { intent: 'refresh'; payload: Record<string, never> }
  | { intent: 'cancel' | 'close-session' | 'terminate' | 'delete' | 'focus' | 'load-older'; payload: { id: string } };

const kinds = ['sqlite', 'shell', 'acp', 'browser', 'ssh', 'terminal'] as const;
const statuses = ['Idle', 'Running', 'Closed', 'Completed', 'Failed', 'Terminated'] as const;
const hasOwn = (value: object, key: string): boolean => Object.hasOwn(value, key);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(row: Record<string, unknown>, key: string): boolean {
  return !hasOwn(row, key) || typeof row[key] === 'string';
}

function optionalNumber(row: Record<string, unknown>, key: string): boolean {
  return !hasOwn(row, key) || (typeof row[key] === 'number' && Number.isFinite(row[key]));
}

function isActivity(value: unknown): value is ConnectionActivity {
  return object(value) && ['message', 'thought', 'tool', 'plan', 'permission'].includes(String(value.kind))
    && typeof value.text === 'string' && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp);
}

function isBlock(value: unknown): value is ConnectionBlock {
  return object(value) && typeof value.prompt === 'string'
    && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)
    && Array.isArray(value.entries) && value.entries.every(isActivity)
    && optionalString(value, 'answer') && optionalNumber(value, 'endedAt');
}

function isSource(value: unknown): value is ConnectionSource {
  if (!object(value) || typeof value.model !== 'string' || typeof value.ownerLabel !== 'string'
    || typeof value.ownerName !== 'string') return false;
  if (value.kind === 'acp') return true;
  return value.kind === 'agent' && typeof value.runId === 'string' && typeof value.taskPath === 'string';
}

function isWindow(value: unknown): value is ConnectionWindow {
  return object(value) && typeof value.id === 'string'
    && isSource(value.source) && Array.isArray(value.blocks) && value.blocks.every(isBlock)
    && typeof value.totalBlocks === 'number' && Number.isFinite(value.totalBlocks)
    && typeof value.offset === 'number' && Number.isFinite(value.offset)
    && typeof value.hasOlder === 'boolean';
}

function isAcpRef(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.scope === 'tab') return typeof value.label === 'string';
  if (value.scope === 'monitor') return typeof value.name === 'string';
  return value.scope === 'editor' && typeof value.label === 'string' && typeof value.persona === 'string';
}

export function isConnectionRow(value: unknown): value is ConnectionRow {
  if (!object(value) || typeof value.id !== 'string' || typeof value.host !== 'string'
    || typeof value.ownerLabel !== 'string'
    || typeof value.ownerName !== 'string' || typeof value.orderingTimestamp !== 'number'
    || !Number.isFinite(value.orderingTimestamp) || !optionalString(value, 'focusTarget') || !optionalString(value, 'runId')
    || !optionalNumber(value, 'startedAt') || !optionalNumber(value, 'updatedAt')
    || !optionalNumber(value, 'endedAt') || (hasOwn(value, 'window') && !isWindow(value.window))
    || (hasOwn(value, 'acpRef') && !isAcpRef(value.acpRef))) return false;
  if (value.type === 'live') {
    return kinds.includes(value.kind as typeof kinds[number]) && typeof value.display === 'string'
      && value.status === 'Open' && (!hasOwn(value, 'permanent') || value.permanent === true);
  }
  return value.type === 'record' && (kinds.includes(value.kind as typeof kinds[number]) || value.kind === 'agent')
    && typeof value.title === 'string' && typeof value.model === 'string'
    && statuses.includes(value.status as typeof statuses[number])
    && typeof value.startedAt === 'number' && typeof value.updatedAt === 'number';
}

export function isConnectionsPayload(value: unknown): value is ConnectionsPayload {
  if (!object(value)) return false;
  if (value.kind === 'list') return Array.isArray(value.rows) && value.rows.every(isConnectionRow);
  return value.kind === 'connection' && isConnectionRow(value.record) && value.record.type === 'record';
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return object(value) && Object.keys(value).length === 0;
}

export function isIdIntent(value: unknown): value is { id: string } {
  return object(value) && Object.keys(value).length === 1 && typeof value.id === 'string';
}

export function isKindIdOwnerIntent(value: unknown): value is { kind: ConnectionKind; id: string; ownerLabel: string } {
  return object(value) && Object.keys(value).length === 3
    && kinds.includes(value.kind as typeof kinds[number]) && typeof value.id === 'string'
    && typeof value.ownerLabel === 'string';
}
