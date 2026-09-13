import { randomUUID } from 'node:crypto';
import type { ConversationsView, TabPluginServerCapabilities } from '../api.js';
import { isConversationsData, type ConversationTabPayload } from './shared.js';

export function dataFrom(capabilities: TabPluginServerCapabilities): ConversationsView {
  const data = capabilities.topicData('conversations');
  if (!isConversationsData(data)) return capabilities.reportFailure('invalid conversations topic data');
  return data;
}

function conversationPayload(data: ConversationsView, id: string): ConversationTabPayload | undefined {
  const conversation = data.windows.find((window) => window.id === id);
  return conversation
    ? { kind: 'conversation', conversation, models: [...data.models] }
    : undefined;
}

export class ConversationTabs {
  private readonly drafts = new Map<string, string>();

  create(draftQuery: string | undefined, capabilities: TabPluginServerCapabilities): void {
    const id = randomUUID();
    capabilities.topicAction({ topic: 'conversations', action: 'create', id });
    const payload = conversationPayload(dataFrom(capabilities), id);
    if (!payload) return capabilities.reportFailure('created conversation is unavailable');
    capabilities.openOrFocusTab(id, () => {
      if (draftQuery !== undefined) this.drafts.set(id, draftQuery);
      return {
        title: payload.conversation.title,
        payload: draftQuery === undefined ? payload : { ...payload, draftQuery },
      };
    });
  }

  open(id: string, capabilities: TabPluginServerCapabilities): void {
    capabilities.topicAction({ topic: 'conversations', action: 'load', id });
    const payload = conversationPayload(dataFrom(capabilities), id);
    if (!payload) return capabilities.rejectRequest(`Conversation "${id}" not found`);
    capabilities.openOrFocusTab(id, () => {
      this.drafts.delete(id);
      return { title: payload.conversation.title, payload };
    });
  }

  update(data: ConversationsView, keys: readonly string[], capabilities: TabPluginServerCapabilities): void {
    const open = new Set(keys);
    for (const key of this.drafts.keys()) {
      if (!open.has(key)) this.drafts.delete(key);
    }
    for (const key of keys) {
      const payload = conversationPayload(data, key);
      if (!payload) continue;
      const draftQuery = this.drafts.get(key);
      capabilities.updateTab(key, () => ({
        title: payload.conversation.title,
        payload: draftQuery === undefined ? payload : { ...payload, draftQuery },
      }));
    }
  }

  consume(id: string, capabilities: TabPluginServerCapabilities): void {
    if (!this.drafts.delete(id)) return;
    const payload = conversationPayload(dataFrom(capabilities), id);
    if (payload) capabilities.updateTab(id, () => ({ payload }));
  }

  dispose(): void {
    this.drafts.clear();
  }
}
