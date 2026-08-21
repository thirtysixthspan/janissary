import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { AUDIO_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const audioManifest = {
  id: 'audio',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: AUDIO_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'audio',
  fileExtensions: {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.aiff': 'audio/aiff',
    // Claimed so the row has an owner, served with nothing: no browser decodes it, so its inline
    // presentation behaves exactly as its external one and the file goes to the configured player.
    '.wma': undefined,
  },
  editGesture: 'open external',
  command: 'audio',
  selectionAction: { label: 'Add to playlist', action: 'queue' },
  capabilities: [
    'note',
    'notifyUser',
    'openOrFocusTab',
    'updateTab',
    'openClaimedFiles',
    'configuredViewer',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
