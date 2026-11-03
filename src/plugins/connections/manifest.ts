import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';
import { CONNECTIONS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const connectionsManifest = {
  id: 'connections',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: CONNECTIONS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'connections',
  fileExtensions: {},
  command: 'connections',
  commandAliases: ['connection'],
  notifications: ['connections'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'closeOwnTab',
    'dockTab',
    'topicData',
    'topicAction',
    'originTab',
    'note',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
