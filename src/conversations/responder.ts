import { isRateLimitError } from '../acp/rate-limit.js';
import type { ConversationTurnView } from '../protocol.js';
import type { ConversationSessions } from './sessions.js';
import type { Conversation } from './store.js';
import type { ConversationStore } from './store.js';
import {
  availableConversationModels,
  conversationPrompt,
  conversationTitle,
  hasConversationModel,
} from './view.js';

const STREAM_TICK_MS = 100;

type InFlight = {
  conversation: Conversation;
  turn: ConversationTurnView;
  previousTitle: string;
  previousUpdatedAt: number;
  timer?: ReturnType<typeof setTimeout>;
};

export class ConversationResponder {
  private readonly inFlight = new Map<string, InFlight>();

  constructor(
    private store: ConversationStore,
    private sessions: ConversationSessions,
    private now: () => number,
    private changed: () => void,
  ) {}

  ids(): IterableIterator<string> {
    return this.inFlight.keys();
  }

  send(conversation: Conversation, query: string): boolean {
    const id = conversation.id;
    if (this.inFlight.has(id) || !query.trim()) return false;
    const storedTurns = [...conversation.turns];
    const hadSession = this.sessions.has(id);
    const pair = hasConversationModel(conversation.pair)
      ? conversation.pair
      : availableConversationModels()[0] ?? conversation.pair;
    conversation.pair = pair;
    const turn: ConversationTurnView = { query, response: '', pair, streaming: true };
    const pending: InFlight = {
      conversation,
      turn,
      previousTitle: conversation.title,
      previousUpdatedAt: conversation.updatedAt,
    };
    if (conversation.turns.length === 0) conversation.title = conversationTitle(query);
    conversation.updatedAt = this.now();
    conversation.turns.push(turn);
    this.inFlight.set(id, pending);
    this.changed();

    const workspace = this.store.ensure(id);
    const session = this.sessions.session(id, pair, workspace, {
      onError: (message) => { this.fail(id, pending, message); },
    });
    session.prompt(hadSession ? query : conversationPrompt(query, storedTurns), {
      onChunk: (text) => { this.chunk(id, pending, text); },
      onEnd: () => { this.complete(id, pending); },
      onError: (message) => { this.fail(id, pending, message); },
    });
    return true;
  }

  cancel(id: string): boolean {
    const pending = this.inFlight.get(id);
    this.sessions.close(id);
    if (!pending) return false;
    if (pending.timer) clearTimeout(pending.timer);
    pending.conversation.turns = pending.conversation.turns.filter(
      (turn) => turn !== pending.turn,
    );
    pending.conversation.title = pending.previousTitle;
    pending.conversation.updatedAt = pending.previousUpdatedAt;
    this.inFlight.delete(id);
    this.changed();
    return true;
  }

  close(id: string): void {
    this.sessions.close(id);
  }

  dispose(): void {
    for (const pending of this.inFlight.values()) {
      if (pending.timer) clearTimeout(pending.timer);
    }
    this.inFlight.clear();
    this.sessions.dispose();
  }

  private chunk(id: string, pending: InFlight, text: string): void {
    if (this.inFlight.get(id) !== pending) return;
    pending.turn.response += text;
    pending.timer ??= setTimeout(() => {
      pending.timer = undefined;
      if (this.inFlight.get(id) === pending) this.changed();
    }, STREAM_TICK_MS);
  }

  private complete(id: string, pending: InFlight): void {
    if (this.inFlight.get(id) !== pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    delete pending.turn.streaming;
    this.inFlight.delete(id);
    this.store.write(pending.conversation);
    this.changed();
  }

  private fail(id: string, pending: InFlight, message: string): void {
    if (this.inFlight.get(id) !== pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    delete pending.turn.streaming;
    pending.turn.error = isRateLimitError(message) ? `Rate limited: ${message}` : message;
    this.inFlight.delete(id);
    this.sessions.close(id);
    this.store.write(pending.conversation);
    this.changed();
  }
}
