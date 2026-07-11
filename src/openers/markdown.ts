import { statSync } from 'node:fs';
import path from 'node:path';
import type { Opener } from './types.js';
import { humanSize } from './size.js';
import { openInDefaultViewer } from './external-viewer.js';

export const opener: Opener = {
  name: 'markdown',
  extensions: ['.md', '.markdown'],
  external: openInDefaultViewer,
  inline: (file, context) => {
    const name = path.basename(file);
    let size: string;
    try { size = humanSize(statSync(file).size); } catch { size = 'unknown'; }
    context.openMarkdownTab({ name, path: file, size, url: context.registerFile(file) });
  },
};
