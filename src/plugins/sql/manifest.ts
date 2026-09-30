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
  // No extensions, deliberately. A database is reachable only by the name the registry holds it
  // under, and `dbPath` derives the path from that name — so claiming `.sqlite` would promise an
  // `open` route the registry cannot serve.
  fileExtensions: {},
  command: 'sql',
  notifications: ['databases'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'dockTab',
    'topicData',
    'topicAction',
    'notifyUser',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
