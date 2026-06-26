import { statSync } from 'node:fs';
import path from 'node:path';
import type { Opener } from './types.js';

// Render a byte count as a compact human-readable size (e.g. "1.4 MB", "812 B").
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

// The first opener: handles common raster and vector image types. `external` hands the image to the
// OS image viewer; `inline` mounts an image tab showing the file's metadata and the image itself.
export const opener: Opener = {
  name: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'],
  external: (file, context) => {
    const name = path.basename(file);
    if (context.openExternally(file)) context.note(`Opening ${name} in your image viewer…`);
    else context.note(`No image viewer available. The file is at ${file}`);
  },
  inline: (file, context) => {
    const name = path.basename(file);
    let size: string;
    try { size = humanSize(statSync(file).size); } catch { size = 'unknown'; }
    context.openImageTab({ name, path: file, size, url: context.registerFile(file) });
  },
};
