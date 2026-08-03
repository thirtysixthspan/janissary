import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { PAGE_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The embedded web page. It claims no file extensions and no command: it is reached only through the
// web-target claim, which is the `open` command's web branch — an http/https address, or any address
// preceded by the `page` keyword.
export const pageManifest = {
  id: 'page',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: PAGE_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'page',
  fileExtensions: {},
  webTargets: true,
  capabilities: [
    'note',
    'openOrFocusTab',
    'updateTab',
    'snapshotTab',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
