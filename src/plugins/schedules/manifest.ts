import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SCHEDULES_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The aggregated schedule list. Unlike every other bundled plugin this one opens on no file: it
// claims no extensions, is reached only through its `schedules` command, and gets everything it
// shows from the host's `schedules` topic.
export const schedulesManifest = {
  id: 'schedules',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SCHEDULES_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'schedules',
  fileExtensions: {},
  command: 'schedules',
  notifications: ['schedules'],
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
