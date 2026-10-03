import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { ASCIICAST_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const asciicastManifest = {
  id: 'asciicast',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: ASCIICAST_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'asciicast',
  // The media type is the format's own documented suggestion, which is what makes a recording served
  // under `/open/` arrive as text the player can parse rather than an opaque byte stream.
  fileExtensions: { '.cast': 'application/x-asciicast' },
  // A `.cast` is playable, which is what `play` asks the declaration before routing one here. No
  // command word of its own: `play` is a core command, so the plugin cannot claim it, and the
  // extension claim is what makes `open <file>.cast` and a file navigator row reach the same tab.
  playable: true,
  capabilities: [
    'openOrFocusTab',
    // A recording cannot say whether its session is still running, so the payload asks the host which
    // of its files a live tab is still writing.
    'isRecordingLive',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;