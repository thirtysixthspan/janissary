import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginResources,
  TabPluginServerCapabilities,
} from '../api.js';
import { fileSize, openFileExternally } from '../files.js';
import { saveImageEdit } from './edit.js';
import {
  isImagePayload, isSaveEditPayload, type ImageMode, type ImagePayload,
} from './shared.js';

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  openFileExternally(file, capabilities, 'image viewer');
}

// `mode` is omitted rather than set to `undefined` for the viewer: a tab payload has to be
// JSON-compatible, and an explicit `undefined` is not.
function imagePayload(
  file: string, resources: TabPluginResources, mode?: ImageMode,
): ImagePayload {
  const payload: ImagePayload = {
    name: path.basename(file),
    path: file,
    size: fileSize(file),
    url: resources.registerFile(file),
  };
  return mode ? { ...payload, mode } : payload;
}

// Both presentations key the tab on the file path, so the viewer and the editor are the same tab.
// `edit` on an image already open as a viewer therefore focuses it and flips it, rather than opening
// a second tab for the same file; the `updateTab` is what carries the mode across for that case.
function openImageTab(
  file: string, capabilities: TabPluginServerCapabilities, mode?: ImageMode,
): void {
  capabilities.openOrFocusTab(file, (resources) => ({
    title: path.basename(file),
    payload: imagePayload(file, resources, mode),
  }));
  if (mode) capabilities.updateTab(file, (resources) => ({ payload: imagePayload(file, resources, mode) }));
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isImagePayload,
    opener: {
      external: openExternal,
      inline: (file, capabilities) => { openImageTab(file, capabilities); },
      edit: (file, capabilities) => { openImageTab(file, capabilities, 'edit'); },
    },
    // The viewer half answers no intents — its zoom, pan, and orientation are client-local. The
    // editor half answers exactly one: the canvas holds the edited pixels, so the flatten happens in
    // the browser, while the server owns the destination and the filename entirely.
    intent: (request, capabilities) => {
      const tabPayload = request.tabPayload;
      if (isImagePayload(tabPayload)) {
        if (request.intent === 'save-edit') {
          if (isSaveEditPayload(request.payload)) {
            return { name: saveImageEdit(tabPayload.path, request.payload.dataUrl) };
          }
          return capabilities.rejectRequest('invalid save-edit payload');
        }
        return capabilities.rejectRequest(`unknown image intent "${request.intent}"`);
      }
      // The tab payload is the host's own record, not client input, so a bad one means this plugin
      // produced something invalid — a real failure rather than a request worth answering.
      return capabilities.reportFailure('invalid image tab payload');
    },
  };
}
