import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Where the application's own copy of the persona lives, relative to this module. The same depth in
// `src/` and in `dist/`, so a checkout and an installed package answer alike — the approach
// `src/project/init.ts` already takes to find this application's own `.codex` and `.claude` trees.
// `ai/` is in the published package's `files` list, so the file is there in an installation too.
const SHIPPED_PERSONA = path.join(import.meta.dirname, '..', '..', '..', 'ai/personas/launcher/summarizer.md');

const PERSONA_NAME = 'summarizer';
const ROLE_PREFIX = '[//]: # role: ';

// The persona that tells the summarizer what a tab's status paragraph is for. A project's own file at
// `ai/personas/launcher/summarizer.md` is used when it has one — a project that has tuned its own
// wording gets its own wording — and the copy the application ships with is the fallback, because
// `janus init` creates `ai/personas/` and writes nothing into it, so a project that has run it has no
// persona of its own and would otherwise never summarise anything.
//
// It is read here rather than through `src/personas.ts` because that is a host internal a plugin
// cannot import.
//
// Only the body and the declared role are used. The first line is a harness directive naming the role
// whose models configure the launcher tab's own core ACP connection, which is what this session runs
// on; the role is passed to that connection and the remaining lines are its startup prompt.
function readPersona(root: string): { role: string; body: string } {
  const own = path.join(root, 'ai/personas/launcher/summarizer.md');
  const file = existsSync(own) ? own : SHIPPED_PERSONA;
  const lines = readFileSync(file, 'utf8').split('\n');
  const directive = lines[0] ?? '';
  const role = directive.startsWith(ROLE_PREFIX) ? directive.slice(ROLE_PREFIX.length).trim() : '';
  if (!role) {
    throw new Error(`Persona "${PERSONA_NAME}": expected first line [//]: # role: <role>.`);
  }
  return { role, body: lines.slice(1).join('\n').trim() };
}

export function readPersonaBody(root: string): string {
  return readPersona(root).body;
}

export function readPersonaRole(root: string): string {
  return readPersona(root).role;
}

// The two configuration failures the core pipeline reports with a notification of its own. Their
// refusal reaches the summarize intent's catch; repeating it there would notify twice.
export function isRoleConfigurationFailure(error: unknown, role: string, textOf: (error: unknown) => string): boolean {
  const text = textOf(error);
  return text === `Persona "${PERSONA_NAME}" requests unknown role "${role}".`
    || text === `Persona "${PERSONA_NAME}" finds no enabled models in role "${role}".`;
}
