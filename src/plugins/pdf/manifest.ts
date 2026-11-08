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
  // Claimed rather than refused, and honoured only while a PDF tab is the active one: the
  // application leaves Cmd+F to the editor everywhere else. A centre tab's claim moves with the
  // current tab; a docked tab's claim lasts while its sidebar shows it. The chord runs for the
  // focused tab label, so the mounted body answers it with the find overlay and any other focus
  // falls through to the application. A handler that has nothing to open while the document loads
  // or has failed still consumes the chord, keeping the browser's own find bar shut.
  chords: ['meta+f'],
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
