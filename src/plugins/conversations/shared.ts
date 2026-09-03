export const CONVERSATIONS_PAYLOAD_SCHEMA_VERSION = 1;

export type ConversationModelPair = { harness: 'claude' | 'opencode'; model: string };
export type ConversationSummary = { id: string; title: string; updatedAt: number };
export type ConversationTurn = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  error?: string;
  streaming?: boolean;
};
export type ConversationWindow = {
  id: string;
  title: string;
  pair: ConversationModelPair;
  turns: ConversationTurn[];
  hasOlder: boolean;
  deleted?: boolean;
};
export type ConversationsData = {
  summaries: ConversationSummary[];
  windows: ConversationWindow[];
  models: ConversationModelPair[];
};
export type ConversationListPayload = { kind: 'list'; entries: ConversationSummary[] };
export type ConversationTabPayload = {
  kind: 'conversation';
  conversation: ConversationWindow;
  models: ConversationModelPair[];
};
export type ConversationsPayload = ConversationListPayload | ConversationTabPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPair(value: unknown): value is ConversationModelPair {
  return isRecord(value)
    && (value.harness === 'claude' || value.harness === 'opencode')
    && typeof value.model === 'string';
}

function isSummary(value: unknown): value is ConversationSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.updatedAt === 'number';
}

function isTurn(value: unknown): value is ConversationTurn {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && (value.streaming === undefined || typeof value.streaming === 'boolean');
}

function isWindow(value: unknown): value is ConversationWindow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && isPair(value.pair)
    && Array.isArray(value.turns)
    && value.turns.every((turn) => isTurn(turn))
    && typeof value.hasOlder === 'boolean'
    && (value.deleted === undefined || typeof value.deleted === 'boolean');
}

export function isConversationsData(value: unknown): value is ConversationsData {
  return isRecord(value)
    && Array.isArray(value.summaries)
    && value.summaries.every((summary) => isSummary(summary))
    && Array.isArray(value.windows)
    && value.windows.every((window) => isWindow(window))
    && Array.isArray(value.models)
    && value.models.every((pair) => isPair(pair));
}

export function isConversationsPayload(value: unknown): value is ConversationsPayload {
  if (!isRecord(value)) return false;
  if (value.kind === 'list') {
    return Array.isArray(value.entries) && value.entries.every((entry) => isSummary(entry));
  }
  return value.kind === 'conversation'
    && isWindow(value.conversation)
    && Array.isArray(value.models)
    && value.models.every((pair) => isPair(pair));
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isIdIntent(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === 'string';
}

export function isSendIntent(value: unknown): value is { query: string } {
  return isRecord(value) && typeof value.query === 'string';
}

export function isSelectModelIntent(value: unknown): value is ConversationModelPair {
  return isPair(value);
}
