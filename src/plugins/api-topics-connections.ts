import type { ConnectionsTopicData } from '../protocol/connections.js';
import type { ConnectionKind } from '../connection/types.js';

export type ConnectionsTopicNotification = {
  topic: 'connections';
  data: ConnectionsTopicData;
  tabs: readonly string[];
};

export type ConnectionsTopicAction =
  | { topic: 'connections'; action: 'load'; id: string }
  | { topic: 'connections'; action: 'loadOlder'; id: string }
  | { topic: 'connections'; action: 'delete'; id: string }
  | { topic: 'connections'; action: 'list'; label: string }
  | { topic: 'connections'; action: 'open'; kind: ConnectionKind; id: string; ownerLabel: string }
  | { topic: 'connections'; action: 'close'; kind: ConnectionKind; id: string; ownerLabel: string }
  | { topic: 'connections'; action: 'closeCommand'; kind: ConnectionKind; id: string; label: string }
  | { topic: 'connections'; action: 'cancel'; id: string }
  | { topic: 'connections'; action: 'closeSession'; id: string }
  | { topic: 'connections'; action: 'terminate'; id: string };
