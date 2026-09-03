import { MARKDOWN_INSTRUCTION } from '../acp/launch.js';
import { modelsFor } from '../harness/models.js';
import type {
  ConversationModelPair,
  ConversationTurnView,
  ConversationWindowView,
} from '../protocol.js';
import type { Conversation } from './store.js';

export const CONVERSATION_WINDOW_SIZE = 20;

// The name a conversation carries until something names it. Also what `rename` compares against to
// tell a conversation nobody has named from one somebody has: the first query titles the former and
// leaves the latter alone, which needs no stored flag to decide.
export const DEFAULT_CONVERSATION_TITLE = 'New conversation';

// The longest title a conversation can carry, whichever way it got one — the first line of its first
// query, or a rename.
export const CONVERSATION_TITLE_MAX_LENGTH = 60;

export function conversationTitle(query: string): string {
  return (query.split('\n', 1)[0] ?? '').slice(0, CONVERSATION_TITLE_MAX_LENGTH) || DEFAULT_CONVERSATION_TITLE;
}

export function availableConversationModels(): ConversationModelPair[] {
  return (['claude', 'opencode'] as const).flatMap((harness) =>
    modelsFor(harness).map((model) => ({ harness, model })));
}

export function hasConversationModel(pair: ConversationModelPair): boolean {
  return availableConversationModels().some((candidate) =>
    candidate.harness === pair.harness && candidate.model === pair.model);
}

export function conversationPrompt(
  query: string,
  turns: readonly ConversationTurnView[],
): string {
  const replay = turns.slice(-CONVERSATION_WINDOW_SIZE).map((turn) =>
    `User: ${turn.query}\n\nAssistant: ${turn.error ?? turn.response}`).join('\n\n');
  return [MARKDOWN_INSTRUCTION, replay, `User: ${query}`].filter(Boolean).join('\n\n');
}

export function conversationWindow(
  conversation: Conversation,
  size: number,
): ConversationWindowView {
  return {
    id: conversation.id,
    title: conversation.title,
    pair: conversation.pair,
    turns: conversation.turns.slice(-size),
    hasOlder: conversation.turns.length > size,
  };
}
