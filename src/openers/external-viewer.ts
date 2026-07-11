import path from 'node:path';
import type { OpenContext } from './types.js';

// Hand a file to the OS's default viewer (via `context.openExternally`), noting success or the
// fallback path in the originating tab's transcript. Shared by openers with no specialized
// external-viewer messaging of their own.
export function openInDefaultViewer(file: string, context: OpenContext): void {
  const name = path.basename(file);
  if (context.openExternally(file)) context.note(`Opening ${name} in your default viewer…`);
  else context.note(`No viewer available. The file is at ${file}`);
}
