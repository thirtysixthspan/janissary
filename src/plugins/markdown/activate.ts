import { statSync } from 'node:fs';
import path from 'node:path';
import type {
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import { humanSize } from '../../openers/size.js';
import { isMarkdownPayload } from './shared.js';

function openExternal(file: string, capabilities: TabPluginServerCapabilities): void {
  const name = path.basename(file);
  if (capabilities.openExternally(file)) capabilities.note(`Opening ${name} in your default viewer…`);
  else capabilities.note(`No viewer available. The file is at ${file}`);
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isMarkdownPayload,
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
    // The markdown view answers no intents: it renders a snapshot of the file and its scroll
    // position is client-local. The contract still requires a handler, so every request is refused —
    // a bad request rather than a broken plugin, except for a tab payload this plugin cannot have
    // produced.
    intent: (request, capabilities) => {
      if (isMarkdownPayload(request.tabPayload)) {
        return capabilities.rejectRequest(`unknown markdown intent "${request.intent}"`);
      }
      return capabilities.reportFailure('invalid markdown tab payload');
    },
  };
}
