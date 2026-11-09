import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';
import { COMMANDS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const commandsManifest = {
  id: 'commands',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: COMMANDS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'commands',
  fileExtensions: {},
  command: 'commands',
  notifications: ['commands'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'topicData',
    'topicAction',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
