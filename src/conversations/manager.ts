import { messageBus, type Subscription } from '../bus.js';
import type { Managers } from '../managers.js';
import type { ConversationModelPair, ConversationsView } from '../protocol.js';
import { ConversationResponder } from './responder.js';
import { ConversationSessions } from './sessions.js';
import {
  CONVERSATION_SCHEMA_VERSION,
  type Conversation,
  ConversationStore,
} from './store.js';
import {
  availableConversationModels,
  conversationWindow,
  CONVERSATION_WINDOW_SIZE,
  hasConversationModel,
} from './view.js';

type ManagerOptions = {
  store?: ConversationStore;
  sessions?: ConversationSessions;
  now?: () => number;
};

export class ConversationsManager {
  private readonly store: ConversationStore;
  private readonly now: () => number;
  private readonly responder: ConversationResponder;
  private readonly conversations = new Map<string, Conversation>();
  private readonly windowSizes = new Map<string, number>();
  private readonly tabRemoved: Subscription;

  constructor(private managers: Managers, options: ManagerOptions = {}) {
    this.store = options.store ?? new ConversationStore();
    const sessions = options.sessions ?? new ConversationSessions();
    this.now = options.now ?? Date.now;
    this.responder = new ConversationResponder(
      this.store, sessions, this.now, () => { this.changed(); },
    );
    this.tabRemoved = messageBus.on('transcript', 'tab:removed', () => {
      queueMicrotask(() => { this.cancelClosedConversations(); });
    });
  }

  view(): ConversationsView {
    const summaries = new Map(this.store.list().map((summary) => [summary.id, summary]));
    for (const conversation of this.conversations.values()) {
      summaries.set(conversation.id, {
        id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt,
      });
    }
    return {
      summaries: [...summaries.values()].toSorted((a, b) => b.updatedAt - a.updatedAt),
      windows: [...this.windowSizes.keys()].flatMap((id) => {
        const window = this.window(id);
        return window ? [window] : [];
      }),
      models: availableConversationModels(),
    };
  }

  create(id: string): boolean {
    if (this.conversations.has(id) || this.store.read(id)) return false;
    const pair = availableConversationModels()[0];
    if (!pair) throw new Error('No ACP conversation models configured.');
    const timestamp = this.now();
    this.conversations.set(id, {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      id,
      title: 'New conversation',
      createdAt: timestamp,
      updatedAt: timestamp,
      pair,
      turns: [],
    });
    this.windowSizes.set(id, CONVERSATION_WINDOW_SIZE);
    this.changed();
    return true;
  }

  load(id: string): boolean {
    const conversation = this.get(id);
    if (!conversation) return false;
    this.windowSizes.set(id, CONVERSATION_WINDOW_SIZE);
    return true;
  }

  loadOlder(id: string): void {
    const conversation = this.get(id);
    if (!conversation) return;
    const size = this.windowSizes.get(id) ?? CONVERSATION_WINDOW_SIZE;
    this.windowSizes.set(id, Math.min(
      conversation.turns.length, size + CONVERSATION_WINDOW_SIZE,
    ));
    this.changed();
  }

  send(id: string, query: string): boolean {
    const conversation = this.get(id);
    return conversation ? this.responder.send(conversation, query) : false;
  }

  cancel(id: string): boolean {
    return this.responder.cancel(id);
  }

  selectModel(id: string, pair: ConversationModelPair): boolean {
    const conversation = this.get(id);
    if (!conversation || !hasConversationModel(pair)) return false;
    this.cancel(id);
    conversation.pair = pair;
    if (conversation.turns.length > 0) this.store.write(conversation);
    this.changed();
    return true;
  }

  openFiles(id: string): boolean {
    const target = this.workspaceTarget(id);
    if (!target) return false;
    this.managers.fileNavigator.openOrRetarget(target.label);
    return true;
  }

  launchAgent(id: string): boolean {
    const target = this.workspaceTarget(id);
    if (!target) return false;
    this.managers.profile.newAgentInWorkspace(target.label, target.workspace);
    return true;
  }

  delete(id: string): void {
    this.cancel(id);
    this.responder.close(id);
    this.conversations.delete(id);
    this.windowSizes.delete(id);
    this.store.delete(id);
    this.changed();
  }

  dispose(): void {
    this.tabRemoved.unsubscribe();
    this.responder.dispose();
  }

  private get(id: string): Conversation | undefined {
    const existing = this.conversations.get(id);
    if (existing) return existing;
    const stored = this.store.read(id);
    if (stored) this.conversations.set(id, stored);
    return stored;
  }

  private window(id: string) {
    const conversation = this.get(id);
    if (!conversation) return;
    const size = this.windowSizes.get(id) ?? CONVERSATION_WINDOW_SIZE;
    return conversationWindow(conversation, size);
  }

  private workspaceTarget(id: string): { label: string; workspace: string } | undefined {
    const conversation = this.get(id);
    const tab = this.managers.tab.tabs.find((candidate) =>
      candidate.plugin?.id === 'conversations' && candidate.plugin.instanceKey === id);
    if (!conversation || !tab) return;
    if (conversation.turns.length === 0) this.store.write(conversation);
    const workspace = this.store.ensure(id);
    this.managers.tab.setCwd(tab.label, workspace);
    return { label: tab.label, workspace };
  }

  private cancelClosedConversations(): void {
    for (const id of this.responder.ids()) {
      const open = this.managers.tab.tabs.some((tab) =>
        tab.plugin?.id === 'conversations' && tab.plugin.instanceKey === id);
      if (!open) this.cancel(id);
    }
  }

  private changed(): void {
    messageBus.emit('conversations', { type: 'changed' });
  }
}
