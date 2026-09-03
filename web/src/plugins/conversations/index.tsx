import '../shared.css';
import './conversations.css';
import type { ConversationsPayload } from '@shared/plugins/conversations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConversationTab } from './ConversationTab';
import { ConversationList } from './ConversationList';

export default function ConversationsPlugin({
  payload,
  capabilities,
}: {
  payload: ConversationsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  return payload.kind === 'list'
    ? <ConversationList payload={payload} capabilities={capabilities} />
    : <ConversationTab payload={payload} capabilities={capabilities} />;
}

export { isConversationsPayload as isPayload } from '@shared/plugins/conversations/shared';
