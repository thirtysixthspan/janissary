import { statSync } from 'node:fs';
import path from 'node:path';
import type { Opener } from './types.js';
import { humanSize } from './size.js';

export const opener: Opener = {
  name: 'markdown',
  extensions: ['.md', '.markdown'],
  external: (file, context) => {
    const name = path.basename(file);
    if (context.openExternally(file)) context.note(`Opening ${name} in your default viewer…`);
    else context.note(`No viewer available. The file is at ${file}`);
  },
  inline: (file, context) => {
    const name = path.basename(file);
    let size: string;
    try { size = humanSize(statSync(file).size); } catch { size = 'unknown'; }
    context.openMarkdownTab({ name, path: file, size, url: context.registerFile(file) });
  },
};
