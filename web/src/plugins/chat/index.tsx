import '../shared.css';
import './chat.css';
import type { ChatPayload } from '@shared/plugins/chat/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ChatTab } from './ChatTab';
import { ConversationList } from './ConversationList';

export default function ChatPlugin({
  payload,
  capabilities,
}: {
  payload: ChatPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  return payload.kind === 'list'
    ? <ConversationList payload={payload} capabilities={capabilities} />
    : <ChatTab payload={payload} capabilities={capabilities} />;
}

export { isChatPayload as isPayload } from '@shared/plugins/chat/shared';
