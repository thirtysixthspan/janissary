import path from 'node:path';
import {
  defineIntents,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { fileTabPayload, openFileInConfiguredViewer, servesContentType } from '../files.js';
import { videoManifest } from './manifest.js';
import {
  isCaptureFramePayload,
  isEmptyPayload,
  isVideoPayload,
  type CaptureFramePayload,
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
          payload: { ...fileTabPayload(file, resources), player: capabilities.configuredViewer() },
        }));
      },
    },
    intent: defineIntents('video', isVideoPayload, {
      'capture-frame': {
        payload: isCaptureFramePayload,
        run: (tabPayload, payload: CaptureFramePayload) => ({
          name: saveVideoShot(tabPayload.path, payload.dataUrl),
        }),
      },
      'open-external': {
        payload: isEmptyPayload,
        run: (tabPayload, _payload: Record<string, never>, capabilities) => {
          openExternal(tabPayload.path, capabilities);
          return null;
        },
      },
    }),
  };
}
