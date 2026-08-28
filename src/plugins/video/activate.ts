import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import { fileSize, openFileInConfiguredViewer, servesContentType } from '../files.js';
import { videoManifest } from './manifest.js';
import {
  isCaptureFramePayload,
  isEmptyPayload,
  isVideoPayload,
} from './shared.js';
import { saveVideoShot } from './shot.js';

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  openFileInConfiguredViewer(file, capabilities, 'video player');
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isVideoPayload,
    // `video <path>` is a second route into this plugin's own opener, not a second behavior: the
    // host runs its ordinary open pipeline pinned to the video opener, so path resolution, wildcard
    // expansion, the ten-file limit, and missing-file errors are all identical to `open <path>`.
    command: (argument, capabilities) => {
      if (!argument) return capabilities.rejectRequest('Usage: video <path>');
      capabilities.openClaimedFiles(argument);
    },
    opener: {
      external: openExternal,
      inline: (file, capabilities) => {
        if (!servesContentType(videoManifest, file)) {
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
            player: capabilities.configuredViewer(),
          },
        }));
      },
    },
    intent: (request, capabilities) => {
      const tabPayload = request.tabPayload;
      if (isVideoPayload(tabPayload)) {
        if (request.intent === 'capture-frame') {
          const payload = request.payload;
          if (isCaptureFramePayload(payload)) {
            return {
              name: saveVideoShot(tabPayload.path, payload.dataUrl),
            };
          }
          return capabilities.rejectRequest('invalid capture-frame payload');
        }
        if (request.intent === 'open-external') {
          if (isEmptyPayload(request.payload)) {
            openExternal(tabPayload.path, capabilities);
            return null;
          }
          return capabilities.rejectRequest('invalid open-external payload');
        }
        return capabilities.rejectRequest(`unknown video intent "${request.intent}"`);
      }
      // The tab payload is the host's own record, not client input, so a bad one means this plugin
      // produced something invalid — a real failure rather than a request worth answering.
      return capabilities.reportFailure('invalid video tab payload');
    },
  };
}
