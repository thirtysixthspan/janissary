import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { MARKDOWN_PAYLOAD_SCHEMA_VERSION } from './shared.js';

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

export const markdownManifest = {
  id: 'markdown',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: MARKDOWN_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'markdown',
  fileExtensions: {
    '.md': MARKDOWN_CONTENT_TYPE,
    '.markdown': MARKDOWN_CONTENT_TYPE,
  },
  capabilities: [
    'note',
    'openOrFocusTab',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
