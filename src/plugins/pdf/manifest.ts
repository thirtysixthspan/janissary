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
  // Claimed rather than refused, and honoured only while a PDF tab is the visible one: the
  // application leaves Cmd+F to the editor everywhere else, and takes it back the moment focus
  // moves. The mounted body answers it with the find overlay; a claim it does not answer falls
  // through to the application unchanged.
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
