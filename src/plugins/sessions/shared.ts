export const SESSIONS_PAYLOAD_SCHEMA_VERSION = 1;

// The sessions tab's payload contract. Import-free on purpose: the client executes these guards
// through `@shared`, and an import would pull NodeNext `.js` resolution or server behavior into the
// browser graph. The shapes are deliberately re-declared rather than imported from the host's
// `RemoteSessionView`; `shared.test.ts` pins the two against each other.

export type SessionRowKind = 'harness' | 'agent' | 'ssh' | 'navigator';

export type SessionRowState =
  | 'provisioning' | 'active' | 'reconnecting' | 'detached' | 'ended';

export type SessionRowAction =
  | 'reattach' | 'detach' | 'end' | 'forget' | 'focus' | 'close';

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
  // An end attempt on this session is in flight: the row says so and its destructive buttons wait.
  ending?: boolean;
};

export type SessionsPayload = { entries: SessionRow[] };

// Every row action the list raises, carrying the row it was pressed on. One intent shape rather than
// six, because every one of them says the same thing: this verb, on this row.
export type SessionIntent = { id: string };

const KINDS = new Set<string>(['harness', 'agent', 'ssh', 'navigator']);
const STATES = new Set<string>(['provisioning', 'active', 'reconnecting', 'detached', 'ended']);
const ACTIONS = new Set<string>(['reattach', 'detach', 'end', 'forget', 'focus', 'close']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isSessionRow(value: unknown): value is SessionRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.host === 'string'
    && typeof value.name === 'string'
    && typeof value.kind === 'string' && KINDS.has(value.kind)
    && typeof value.state === 'string' && STATES.has(value.state)
    && typeof value.activity === 'number'
    && typeof value.destination === 'string'
    && typeof value.workspace === 'string'
    && typeof value.joined === 'boolean'
    && Array.isArray(value.actions)
    && value.actions.every((action) => typeof action === 'string' && ACTIONS.has(action))
    && typeof value.label === 'string'
    && isOptionalString(value.session)
    && isOptionalString(value.failure)
    && (value.ending === undefined || typeof value.ending === 'boolean');
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
