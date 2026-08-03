import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { VIDEO_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const videoManifest = {
  id: 'video',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: VIDEO_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'video',
  fileExtensions: {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': undefined,
    '.avi': undefined,
    '.wmv': undefined,
    '.flv': undefined,
    '.mpg': undefined,
    '.mpeg': undefined,
  },
  editGesture: 'open external',
  command: 'video',
  capabilities: [
    'note',
    'openOrFocusTab',
    'openClaimedFiles',
    'configuredViewer',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
