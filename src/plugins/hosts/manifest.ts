import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { HOSTS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const hostsManifest = {
  id: 'hosts',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: HOSTS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'hosts',
  fileExtensions: {},
  command: 'hosts',
  capabilities: [
    'originTab',
    'notifyUser',
    'note',
    'openOrFocusTab',
    'updateTab',
    'dispatchLineWithOutput',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
