import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SQL_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const sqlManifest = {
  id: 'sql',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SQL_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'sql',
  // No extensions, deliberately. The `open` route is still unclaimed — the `sql` command now serves
  // a path as well as a registry name, but no file extension claim routes one here.
  fileExtensions: {},
  command: 'sql',
  notifications: ['databases'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'ownTabKeys',
    'topicData',
    'topicAction',
    'notifyUser',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
