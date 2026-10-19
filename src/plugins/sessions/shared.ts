import type { RemoteSessionAction, RemoteSessionKind, RemoteSessionState } from '../api.js';

export const SESSIONS_PAYLOAD_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type SessionRowKind = RemoteSessionKind;

export type SessionRowState = RemoteSessionState;

export type SessionRowAction = RemoteSessionAction;

export type SessionRow = {
  id: string;
  host: string;
  name: string;
  kind: SessionRowKind;
  state: SessionRowState;
  activity: number;
  destination: string;
  workspace: string;
  joined: boolean;
  actions: SessionRowAction[];
  label: string;
  session?: string;
  failure?: string;
  // A terminate attempt on this session is in flight: the row says so and its destructive buttons wait.
  terminating?: boolean;
};

export type SessionsPayload = { entries: SessionRow[] };

// Every row action the list raises, carrying the row it was pressed on. One intent shape rather than
// six, because every one of them says the same thing: this verb, on this row.
export type SessionIntent = { id: string };

const KINDS: Record<SessionRowKind, true> = {
  harness: true,
  shell: true,
  ssh: true,
  navigator: true,
};
const STATES: Record<SessionRowState, true> = {
  provisioning: true,
  active: true,
  reconnecting: true,
  detached: true,
  terminated: true,
};
const ACTIONS: Record<SessionRowAction, true> = {
  attach: true,
  detach: true,
  terminate: true,
  forget: true,
  focus: true,
  close: true,
  diff: true,
};

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isSessionRow(value: unknown): value is SessionRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.host === 'string'
    && typeof value.name === 'string'
    && typeof value.kind === 'string' && Object.hasOwn(KINDS, value.kind)
    && typeof value.state === 'string' && Object.hasOwn(STATES, value.state)
    && typeof value.activity === 'number'
    && typeof value.destination === 'string'
    && typeof value.workspace === 'string'
    && typeof value.joined === 'boolean'
    && Array.isArray(value.actions)
    && value.actions.every((action) => typeof action === 'string' && Object.hasOwn(ACTIONS, action))
    && typeof value.label === 'string'
    && isOptionalString(value.session)
    && isOptionalString(value.failure)
    && (value.terminating === undefined || typeof value.terminating === 'boolean');
}

export function isSessionsPayload(value: unknown): value is SessionsPayload {
  return isRecord(value)
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isSessionRow(entry));
}

export function isSessionIntent(value: unknown): value is SessionIntent {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0;
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}
