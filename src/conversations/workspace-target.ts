import type { Managers } from '../managers.js';
import type { Conversation, ConversationStore } from './store.js';

export function findConversationWorkspaceTarget(
  managers: Managers,
  store: ConversationStore,
  id: string,
  conversation: Conversation | undefined,
): { label: string; workspace: string } | undefined {
  const tab = managers.tab.tabs.find((candidate) =>
    candidate.plugin?.id === 'conversations' && candidate.plugin.instanceKey === id);
  if (!conversation || !tab) return;
  if (conversation.turns.length === 0) store.write(conversation);
  const workspace = store.ensure(id);
  managers.tab.setCwd(tab.label, workspace);
  return { label: tab.label, workspace };
}
