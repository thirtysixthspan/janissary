import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';
import { MODELS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const modelsManifest = {
  id: 'models',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: MODELS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'models',
  fileExtensions: {},
  command: 'models',
  notifications: ['models'],
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
