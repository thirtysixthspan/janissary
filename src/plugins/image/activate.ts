import { statSync } from 'node:fs';
import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import { humanSize } from '../../openers/size.js';
import { isImagePayload } from './shared.js';

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  const name = path.basename(file);
  if (capabilities.openExternally(file)) capabilities.note(`Opening ${name} in your image viewer…`);
  else capabilities.note(`No image viewer available. The file is at ${file}`);
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isImagePayload,
    opener: {
      external: openExternal,
      inline: (file, capabilities) => {
        capabilities.openOrFocusTab(file, (resources) => {
          let size = 'unknown';
          try {
            size = humanSize(statSync(file).size);
          } catch {
            // The dispatcher checks existence first; a race with deletion still yields a usable tab.
          }
          return {
            title: path.basename(file),
            payload: {
              name: path.basename(file),
              path: file,
              size,
              url: resources.registerFile(file),
            },
          };
        });
      },
    },
    // The image view answers no intents: it is a pure viewer whose zoom, pan, and orientation are
    // client-local. The contract still requires a handler, so every request is refused — a bad
    // request rather than a broken plugin, except for a tab payload this plugin cannot have produced.
    intent: (request, capabilities) => {
      if (isImagePayload(request.tabPayload)) {
        return capabilities.rejectRequest(`unknown image intent "${request.intent}"`);
      }
      return capabilities.reportFailure('invalid image tab payload');
    },
  };
}
