import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SEARCH_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The project-wide search list. Like the schedules and sessions lists it opens on no file: it claims
// no extensions and is reached only through its `search` command. It is the one bundled plugin that
// holds state across a scan — the in-flight scan and the rows it has produced so far — which is why
// it declares `updateTab` to repaint in place and disposes the scan on shutdown.
export const searchManifest = {
  id: 'search',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SEARCH_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'search',
  fileExtensions: {},
  command: 'search',
  capabilities: [
    'note',
    'openOrFocusTab',
    'updateTab',
    'projectFileList',
    'openInEditor',
    'readSettings',
    'saveSettings',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
