import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { REPLAY_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const replayManifest = {
  id: 'replay',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: REPLAY_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'replay',
  // The media type is the format's own documented suggestion, which is what makes a recording served
  // under `/open/` arrive as text the player can parse rather than an opaque byte stream.
  fileExtensions: { '.cast': 'application/x-asciicast' },
  // `harness replay` and `ssh replay` are subcommands of two reserved command names, so this is how a
  // core command reaches the presentation that owns them. No command word of its own: those two are
  // its routes, and opening a `.cast` by path is the third, through the extension claim.
  coreRoutes: ['replay'],
  capabilities: [
    'openOrFocusTab',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
