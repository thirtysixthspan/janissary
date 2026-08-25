import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { IMAGE_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const imageManifest = {
  id: 'image',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: IMAGE_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'image',
  fileExtensions: {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
  },
  editsOwnFiles: true,
  capabilities: [
    'note',
    'openOrFocusTab',
    'updateTab',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
