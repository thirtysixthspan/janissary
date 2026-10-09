import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { LAUNCHER_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The launcher: the sidebar's home. It opens on no file — it claims no extensions and is reached only
// through its own `launcher` command, which docks it into a sidebar like `schedules left` does — and
// everything it shows is either the application's own command table, which the project configures in
// `.janissary/launcher.json`, or the host's open tabs, which it reads through the `tabs` topic and the
// `tabActivity` capability.
//
// It declares `dispatchLineWithOutput` because a click on a command row is the user's own command line
// running, and `hostsCommandBar` because a docked view with no command bar of its own has nowhere to
// show a dispatched command's answer. Both are the published route a plugin has to the dispatcher and
// the bar, not a second implementation of either.
export const launcherManifest = {
  id: 'launcher',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: LAUNCHER_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'launcher',
  fileExtensions: {},
  command: 'launcher',
  hostsCommandBar: true,
  notifications: ['tabs'],
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'dockTab',
    'topicAction',
    'tabActivity',
    'dispatchLineWithOutput',
    'notifyUser',
    'rejectRequest',
  ],
} as const satisfies TabPluginDeclaration;
