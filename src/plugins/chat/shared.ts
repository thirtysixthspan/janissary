export const CHAT_PAYLOAD_SCHEMA_VERSION = 1;

export type ChatModelPair = { harness: 'claude' | 'opencode'; model: string };
export type ChatSummary = { id: string; title: string; updatedAt: number };
export type ChatTurn = {
  query: string;
  response: string;
  pair: ChatModelPair;
  error?: string;
  streaming?: boolean;
};
export type ChatWindow = {
  id: string;
  title: string;
  pair: ChatModelPair;
  turns: ChatTurn[];
  hasOlder: boolean;
  deleted?: boolean;
};
export type ConversationsData = {
  summaries: ChatSummary[];
  windows: ChatWindow[];
  models: ChatModelPair[];
};
export type ConversationListPayload = { kind: 'list'; entries: ChatSummary[] };
export type ChatTabPayload = {
  kind: 'conversation';
  conversation: ChatWindow;
  models: ChatModelPair[];
};
export type ChatPayload = ConversationListPayload | ChatTabPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPair(value: unknown): value is ChatModelPair {
  return isRecord(value)
    && (value.harness === 'claude' || value.harness === 'opencode')
    && typeof value.model === 'string';
}

function isSummary(value: unknown): value is ChatSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.updatedAt === 'number';
}

function isTurn(value: unknown): value is ChatTurn {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && (value.streaming === undefined || typeof value.streaming === 'boolean');
}

function isWindow(value: unknown): value is ChatWindow {
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

export function isChatPayload(value: unknown): value is ChatPayload {
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

export function isSelectModelIntent(value: unknown): value is ChatModelPair {
  return isPair(value);
}
