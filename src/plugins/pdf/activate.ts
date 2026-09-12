import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import { fileSize, openFileInConfiguredViewer, servesContentType } from '../files.js';
import { pdfManifest } from './manifest.js';
import { isLoadFailedPayload, isPdfPayload, type PdfLoadFailure } from './shared.js';

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  openFileInConfiguredViewer(file, capabilities, 'PDF viewer');
}

// The feed's wording for a failed load. The browser is where PDF.js is, so the failure is detected
// there — but it names one kind from a closed set and the server composes the line, which keeps the
// feed's words out of a client's reach.
function failureLine(name: string, reason: PdfLoadFailure): string {
  if (reason === 'password-protected') return `${name} is password-protected`;
  if (reason === 'unreadable') return `${name} could not be read`;
  return `Could not display ${name}`;
}

// A PDF has one presentation, so `open` and `edit` are the same call: `edit paper.pdf` and
// Shift-activating a PDF row both show the viewer rather than raw bytes in the text editor.
function openPdfTab(file: string, capabilities: TabPluginServerCapabilities): void {
  if (!servesContentType(pdfManifest, file)) {
    openExternal(file, capabilities);
    return;
  }
  capabilities.openOrFocusTab(file, (resources) => ({
    title: path.basename(file),
    payload: {
      name: path.basename(file),
      path: file,
      size: fileSize(file),
      url: resources.registerFile(file),
    },
  }));
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isPdfPayload,
    // `pdf <path>` is a second route into this plugin's own opener, not a second behavior: the host
    // runs its ordinary open pipeline pinned to the PDF opener, so path resolution, wildcard
    // expansion, the ten-file limit, and missing-file errors are all identical to `open <path>`.
    command: (argument, capabilities) => {
      if (!argument) return capabilities.rejectRequest('Usage: pdf <path>');
      capabilities.openClaimedFiles(argument);
    },
    opener: {
      external: openExternal,
      inline: openPdfTab,
      edit: openPdfTab,
    },
    // One intent: the client's report that the document failed to load. Layout, zoom, the current
    // page, and the thumbnail strip are all client-local and say nothing to the server.
    intent: (request, capabilities) => {
      const tabPayload = request.tabPayload;
      if (isPdfPayload(tabPayload)) {
        if (request.intent === 'load-failed') {
          const payload = request.payload;
          if (isLoadFailedPayload(payload)) {
            capabilities.notifyUser(failureLine(tabPayload.name, payload.reason));
            return null;
          }
          return capabilities.rejectRequest('invalid load-failed payload');
        }
        return capabilities.rejectRequest(`unknown pdf intent "${request.intent}"`);
      }
      // The tab payload is the host's own record, not client input, so a bad one means this plugin
      // produced something invalid — a real failure rather than a request worth answering.
      return capabilities.reportFailure('invalid pdf tab payload');
    },
  };
}
