import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { DIFF_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The workspace's changes, GitHub's files-changed format, in a tab. Like the search tab it opens on
// no file: it claims no extensions and is reached through its `diff` command, or through the
// workspace button on a shell or harness tab, which the host routes to this plugin's `openSibling`
// hook. It holds the tab's current root and payload across calls, which is why it declares
// `updateTab` to repaint in place.
export const diffManifest = {
  id: 'diff',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: DIFF_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'diff',
  fileExtensions: {},
  command: 'diff',
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'openInEditor',
    'originTab',
    'dispatchLineWithOutput',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
