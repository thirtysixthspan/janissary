import { statSync } from 'node:fs';
import path from 'node:path';
import type { Opener } from './types.js';
import { humanSize } from './size.js';
import { didOsOpen } from './os-open.js';
import { getConfig } from '../config.js';

// Containers a browser can decode in a `<video>` element. Only these get a video tab.
const PLAYABLE_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.mov']);

// Containers claimed so `open` no longer reports them as unsupported, but which no `<video>`
// element can decode. Their inline presentation delegates to `external`, so they always reach the
// configured player and never open a tab.
const EXTERNAL_ONLY_EXTENSIONS = ['.mkv', '.avi', '.wmv', '.flv', '.mpg', '.mpeg'];

// The application name configured for this opener (see `externalViewers` in `config.ts`), or an
// empty string when the user cleared it — in which case the file goes to the OS default handler.
export function configuredPlayer(): string {
  return getConfig().externalViewers?.video ?? '';
}

function isPlayable(file: string): boolean {
  return PLAYABLE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

// Handles the common video containers. `external` hands the file to the configured player, falling
// back to the OS default handler and then to reporting the path; `inline` mounts a video tab for a
// browser-decodable container and delegates to `external` for everything else.
export const opener: Opener = {
  name: 'video',
  extensions: [...PLAYABLE_EXTENSIONS, ...EXTERNAL_ONLY_EXTENSIONS],
  external: (file, context) => {
    const name = path.basename(file);
    const player = configuredPlayer();
    if (player && didOsOpen(file, player)) { context.note(`Opening ${name} in ${player}…`); return; }
    if (didOsOpen(file)) { context.note(`Opening ${name} in your default video player…`); return; }
    context.note(`No video player available. The file is at ${file}`);
  },
  inline: (file, context) => {
    if (!isPlayable(file)) { void opener.external(file, context); return; }
    const name = path.basename(file);
    let size: string;
    try { size = humanSize(statSync(file).size); } catch { size = 'unknown'; }
    context.openVideoTab({
      name, path: file, size, url: context.registerFile(file), player: configuredPlayer(),
    });
  },
};
