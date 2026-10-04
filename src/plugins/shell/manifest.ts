import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { SHELL_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// `zsh` rather than `shell`, which is one of the two names reserved as core routes and would be
// refused at registration with the plugin starting life disabled. The tab itself is still named
// `shell` — that is what the strip shows.
export const shellManifest = {
  id: 'shell',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: SHELL_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'shell',
  fileExtensions: {},
  command: 'zsh',
  // Claimed rather than refused, and honoured only while a shell tab is the visible one: the
  // application's own history picker owns Ctrl+R everywhere else, and takes it back the moment focus
  // moves. A claim the mounted body does not answer falls through to the application unchanged.
  chords: ['ctrl+r'],
  // The two rows the metadata row's status windows render. The host pushes them when they differ
  // from what it last pushed, so a shell tab sitting idle costs nothing.
  hostState: ['connections', 'schedule'],
  // Asked for explicitly: starting a process is the most powerful thing this plugin can do, and it
  // belongs in the declaration rather than arriving with every plugin.
  spawnTerminal: true,
  capabilities: [
    'originTab',
    'dispatchLine',
    'dispatchLineWithOutput',
    'completeLine',
    // `terminalRunning` is what the mount-time status question asks, so leaving it out does not fail
    // the declaration — it fails the question, and a failed question is a broken plugin. Every
    // capability `activate.ts` reaches for has to be named here or `restrictToDeclared` replaces it
    // with one that throws.
    'terminalRunning',
    'openOrFocusTab',
    'updateTab',
    'setUnread',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
