import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { PDF_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// No `editGesture`: `openersForRow` checks one before it checks the `edit` branch, so a declaration
// carrying both would send Shift-activation of a PDF row to `open external` and leave the viewer
// reachable only by typing the command. Shift-activating a PDF row should show the PDF.
export const pdfManifest = {
  id: 'pdf',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: PDF_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'pdf',
  fileExtensions: {
    '.pdf': 'application/pdf',
  },
  editsOwnFiles: true,
  command: 'pdf',
  capabilities: [
    'note',
    'notifyUser',
    'openOrFocusTab',
    'openClaimedFiles',
    'configuredViewer',
    'openExternally',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
