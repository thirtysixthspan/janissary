import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// AI personas: markdown files under `ai/personas/monitor/` (the `monitor` command) and
// `ai/personas/editor/` (in-editor `>` suggestion requests). The filename (without `.md`)
// is the persona name. The first line is a required role directive; the rest of the file
// is the session's startup prompt.

import { parseRoleDirective } from './persona-parsing.js';

export type PersonaKind = 'monitor' | 'editor';

export type Persona = {
  name: string;
  role: string;
  body: string;
};

function personasDir(root: string, kind: PersonaKind): string {
  return path.join(root, 'ai', 'personas', kind);
}

// Read and parse `ai/personas/<kind>/<name>.md` under `root` (the app's working directory).
// Throws on a missing file or a missing/malformed role directive.
export function loadPersona(name: string, kind: PersonaKind, root: string = process.cwd()): Persona {
  const file = path.join(personasDir(root, kind), `${name}.md`);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No persona "${name}" (looked in ${path.join('ai', 'personas', kind, `${name}.md`)}).`);
  }
  const lines = raw.split('\n');
  const role = parseRoleDirective(name, (lines[0] ?? '').trim());
  const body = lines.slice(1).join('\n').trim();
  return { name, role, body };
}

// Persona names available for the given kind (used by completion and errors).
export function listPersonas(kind: PersonaKind, root: string = process.cwd()): string[] {
  try {
    return readdirSync(personasDir(root, kind))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
