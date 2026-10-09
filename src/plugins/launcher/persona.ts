import { readFileSync } from 'node:fs';
import path from 'node:path';

// The persona that tells the summarizer what a tab's status paragraph is for. It lives in the same
// `ai/personas/` tree every other persona does, under its own `launcher` kind, and is read here rather
// than through `src/personas.ts` because that is a host internal a plugin cannot import.
//
// Only the body is used. A persona file's first line is a harness directive naming the subprocess a
// persona normally spawns, and the summarizer spawns none — it runs through the launcher tab's own core
// ACP connection, whose model is the tab's own. So the directive is not sent: it would be a claim about
// a process this session never starts.
export function readPersonaBody(root: string): string {
  const file = path.join(root, 'ai', 'personas', 'launcher', 'summarizer.md');
  const lines = readFileSync(file, 'utf8').split('\n');
  const directive = lines[0] ?? '';
  if (!directive.trim().startsWith('[//]: # ')) {
    throw new Error(`ai/personas/launcher/summarizer.md has no harness directive. First line must be: [//]: # <harness>:<model>:<variant>.`);
  }
  return lines.slice(1).join('\n').trim();
}
