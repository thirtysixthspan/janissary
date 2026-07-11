import { statSync } from 'node:fs';
import path from 'node:path';
import type { Opener, OpenContext } from './types.js';
import { humanSize } from './size.js';
import { openInDefaultViewer } from './external-viewer.js';

// Refuse to open files above this size: the editor holds the whole buffer in memory and a
// multi-megabyte file is almost certainly not something to hand-edit in-app.
export const EDITOR_MAX_BYTES = 2 * 1024 * 1024;

// Common plain-text extensions the editor claims for `open`. Markdown is deliberately absent —
// `open foo.md` keeps the rendered view; `edit foo.md` forces the editor.
const EXTENSIONS = [
  '.txt', '.text', '.log',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.java',
  '.sh', '.bash', '.zsh',
  '.css', '.html', '.xml', '.sql', '.csv',
];

// Shared inline handler: also the entry point for the `edit` command, which bypasses the opener
// registry so any file (markdown, extensionless) can be edited.
export function openInEditor(file: string, context: OpenContext, line?: number): void {
  const name = path.basename(file);
  let bytes: number | undefined;
  try { bytes = statSync(file).size; } catch { bytes = undefined; }
  if (bytes !== undefined && bytes > EDITOR_MAX_BYTES) {
    context.note(`edit: ${name} is ${humanSize(bytes)} — too large to edit in-app (limit ${humanSize(EDITOR_MAX_BYTES)}).`);
    return;
  }
  const size = bytes === undefined ? 'unknown' : humanSize(bytes);
  context.openEditorTab({ name, path: file, size, url: context.registerFile(file), line });
}

export const opener: Opener = {
  name: 'editor',
  extensions: EXTENSIONS,
  external: openInDefaultViewer,
  inline: (file, context) => { openInEditor(file, context); },
};
