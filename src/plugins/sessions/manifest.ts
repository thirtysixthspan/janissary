import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SESSIONS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The remote sessions list. Like the schedules list it opens on no file: it claims no extensions, is
// reached only through its `sessions` command, and gets everything it shows from the host's
// `sessions` topic.
export const sessionsManifest = {
  id: 'sessions',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SESSIONS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'sessions',
  fileExtensions: {},
  command: 'sessions',
  notifications: ['sessions'],
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
