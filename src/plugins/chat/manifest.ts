import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';
import { CHAT_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const chatManifest = {
  id: 'chat',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: CHAT_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'chat',
  fileExtensions: {},
  command: 'chat',
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
