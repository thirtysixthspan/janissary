import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Where the application's own copy of the persona lives, relative to this module. The same depth in
// `src/` and in `dist/`, so a checkout and an installed package answer alike — the approach
// `src/project/init.ts` already takes to find this application's own `.codex` and `.claude` trees.
// `ai/` is in the published package's `files` list, so the file is there in an installation too.
const SHIPPED_PERSONA = path.join(import.meta.dirname, '..', '..', '..', 'ai/personas/launcher/summarizer.md');

// The persona that tells the summarizer what a tab's status paragraph is for. A project's own file at
// `ai/personas/launcher/summarizer.md` is used when it has one — a project that has tuned its own
// wording gets its own wording — and the copy the application ships with is the fallback, because
// `janus init` creates `ai/personas/` and writes nothing into it, so a project that has run it has no
// persona of its own and would otherwise never summarise anything.
//
// It is read here rather than through `src/personas.ts` because that is a host internal a plugin
// cannot import.
//
// Only the body is used. A persona file's first line is a harness directive naming the subprocess a
// persona normally spawns, and the summarizer spawns none — it runs through the launcher tab's own core
// ACP connection, whose model is the tab's own. So the directive is not sent: it would be a claim about
// a process this session never starts.
export function readPersonaBody(root: string): string {
  const own = path.join(root, 'ai/personas/launcher/summarizer.md');
  const file = existsSync(own) ? own : SHIPPED_PERSONA;
  const lines = readFileSync(file, 'utf8').split('\n');
  const directive = lines[0] ?? '';
  if (!directive.trim().startsWith('[//]: # ')) {
    throw new Error(`ai/personas/launcher/summarizer.md has no harness directive. First line must be: [//]: # <harness>:<model>:<variant>.`);
  }
  return lines.slice(1).join('\n').trim();
}
