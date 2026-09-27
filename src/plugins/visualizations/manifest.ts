import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The same capability set the conversations plugin declares, and the same one for the same reason:
// a singleton index tab, one tab per record, a notification to redraw them, and a topic action for
// every mutation. The source is read by the host, the model is a subprocess the host runs, and the
// agent's data acquisition happens inside the sandbox that session already runs in — so nothing else
// is needed and nothing else may be asked for.
export const visualizationsManifest = {
  id: 'visualizations',
  version: '2.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'visualizations',
  fileExtensions: {},
  command: 'visualizations',
  notifications: ['visualizations'],
  // The cheapest way there is to start one: select an address anywhere the app can read a selection
  // and choose this. The selection becomes the visualization's first message, so the tab opens asking
  // its question with the answer already typed — and the index's plus control opens the same empty
  // conversation, with `visualizations <title>` still opening a saved one by name.
  defaultMenu: { label: 'Visualize this' },
  capabilities: [
    'openOrFocusTab', 'updateTab', 'dockTab', 'topicData', 'topicAction',
    'rejectRequest', 'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
