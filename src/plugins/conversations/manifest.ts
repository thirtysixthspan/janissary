import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';
import { CONVERSATIONS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const conversationsManifest = {
  id: 'conversations',
  version: '2.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: CONVERSATIONS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'conversations',
  fileExtensions: {},
  command: 'conversations',
  notifications: ['conversations'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'dockTab',
    'topicData',
    'topicAction',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
