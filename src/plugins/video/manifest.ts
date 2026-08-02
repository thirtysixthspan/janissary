import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';

// Containers a browser can decode in a `<video>` element. These are exactly the containers that
// open a tab, and exactly the ones the `/open/` route ever serves — which is why having a content
// type and being playable are the same fact, recorded once.
const PLAYABLE: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
};

// Claimed so `open` never reports these as an unsupported file type, but no `<video>` element can
// decode them: both presentations hand the file to the configured player and no tab opens.
const EXTERNAL_ONLY = ['.mkv', '.avi', '.wmv', '.flv', '.mpg', '.mpeg'];

export const PLAYABLE_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(PLAYABLE));

export const videoManifest = {
  id: 'video',
  version: '1.0.0',
  requiredApiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1,
  tab: { labelPrefix: 'video' },
  opener: {
    extensions: [...Object.keys(PLAYABLE), ...EXTERNAL_ONLY],
    mimeTypes: PLAYABLE,
    editAction: 'open external',
  },
  capabilities: ['transcript', 'plugin-tabs', 'served-files', 'external-viewer', 'external-open'],
} as const satisfies TabPluginDeclaration;
