import { statSync } from 'node:fs';
import { basename } from 'node:path';
import type { Opener } from './types.js';

// Render a byte count as a compact human-readable size (e.g. "1.4 MB", "812 B").
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

// The first opener: handles common raster and vector image types. `external` hands the image to the
// OS image viewer; `inline` mounts an image tab showing the file's metadata and the image itself.
export const opener: Opener = {
  name: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'],
  external: (file, ctx) => {
    const name = basename(file);
    if (ctx.openExternally(file)) ctx.note(`Opening ${name} in your image viewer…`);
    else ctx.note(`No image viewer available. The file is at ${file}`);
  },
  inline: (file, ctx) => {
    const name = basename(file);
    let size: string;
    try { size = humanSize(statSync(file).size); } catch { size = 'unknown'; }
    ctx.openImageTab({ name, path: file, size, url: ctx.registerFile(file) });
  },
};
