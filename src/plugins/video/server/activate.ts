import { statSync } from 'node:fs';
import path from 'node:path';
import { humanSize } from '../../../openers/size.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginActivation, type TabPluginServerCapabilities } from '../../api.js';
import { PLAYABLE_EXTENSIONS, videoManifest } from '../manifest.js';
import { isVideoIntent, isVideoIntentReply, isVideoPayload, type VideoCaptureFrame } from '../shared.js';
import { saveVideoShot } from './shot.js';

export function activate(capabilities: TabPluginServerCapabilities): TabPluginActivation {
  const openExternal = (file: string, originLabel: string): boolean => {
    const name = path.basename(file);
    const player = capabilities.externalViewer();
    if (player && capabilities.openExternally(file, player)) {
      capabilities.report(originLabel, `Opening ${name} in ${player}…`);
      return true;
    }
    if (capabilities.openExternally(file)) {
      capabilities.report(originLabel, `Opening ${name} in your default video player…`);
      return true;
    }
    capabilities.report(originLabel, `No video player available. The file is at ${file}`);
    return false;
  };

  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: videoManifest.payloadSchemaVersion,
    validateTabPayload: isVideoPayload,
    opener: {
      external: (file: string, context: { originLabel: string }) => { openExternal(file, context.originLabel); },
      inline: (file: string, context: { originLabel: string }) => {
        if (!PLAYABLE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
          openExternal(file, context.originLabel);
          return;
        }
        capabilities.openPluginTab({
          originLabel: context.originLabel,
          instanceKey: file,
          title: path.basename(file),
          create: ({ registerFile }) => {
            let size = 'unknown';
            try { size = humanSize(statSync(file).size); } catch { /* file disappeared after dispatch */ }
            return {
              name: path.basename(file),
              path: file,
              size,
              url: registerFile(file),
              player: capabilities.externalViewer(),
            };
          },
        });
      },
    },
    validateIntent: isVideoIntent,
    handleIntent: (request, context) => {
      if (!isVideoPayload(context.tabPayload)) throw new Error('video tab payload is invalid');
      const file = context.filePath(context.tabPayload.url);
      if (!file) throw new Error(`video intent: unknown file ref "${context.tabPayload.url}"`);
      if (request.intent === 'open-external') {
        const opened = openExternal(file, context.originLabel);
        return { schemaVersion: videoManifest.payloadSchemaVersion, payload: { opened } };
      }
      const input = request.payload as VideoCaptureFrame;
      return {
        schemaVersion: videoManifest.payloadSchemaVersion,
        payload: { name: saveVideoShot(file, input.dataUrl) },
      };
    },
    validateIntentReply: isVideoIntentReply,
  };
}
