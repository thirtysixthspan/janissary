import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SCRIPTS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const scriptsManifest = {
  id: 'scripts',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SCRIPTS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'scripts',
  fileExtensions: {},
  command: 'scripts',
  notifications: ['runscripts'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'topicData',
    'topicAction',
    'originTab',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
