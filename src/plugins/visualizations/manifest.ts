import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The same capability set the conversations plugin declares, and the same one for the same reason:
// a singleton index tab, one tab per record, a notification to redraw them, and a topic action for
// every mutation. The source is a URL or a file the host reads, and the model is a subprocess the host
// runs, so nothing else is needed and nothing else may be asked for.
export const visualizationsManifest = {
  id: 'visualizations',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'visualizations',
  fileExtensions: {},
  command: 'visualizations',
  notifications: ['visualizations'],
  // The cheapest way there is to point at a data source: select a URL anywhere the app can read a
  // selection and choose this. The index's own source field is the route for a user with no selection
  // to hand, and `visualizations <title>` still opens a saved one by name.
  defaultMenu: { label: 'Visualize this' },
  capabilities: [
    'openOrFocusTab', 'updateTab', 'dockTab', 'topicData', 'topicAction',
    'rejectRequest', 'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
