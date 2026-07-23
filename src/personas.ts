import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// AI personas: markdown files under `ai/personas/monitor/` (the `monitor` command) and
// `ai/personas/editor/` (in-editor `>` suggestion requests). The filename (without `.md`)
// is the persona name. The first line is a required harness directive; the rest of the file
// is the session's startup prompt.

import { parseDirective, isPersonaToolsLine, parsePersonaTools } from './persona-parsing.js';
import type { PersonaHarness } from './persona-parsing.js';
export type { PersonaHarness } from './persona-parsing.js';
export { parseDirective } from './persona-parsing.js';

export type PersonaKind = 'monitor' | 'editor';

export type Persona = {
  name: string;
  harness: PersonaHarness;
  body: string;
  // Tools the persona opted into via the `[//]: # tools:` line (see persona-parsing). Always
  // present — `[]` for a tool-less persona — so callers never branch on undefined.
  tools: string[];
};

function personasDir(root: string, kind: PersonaKind): string {
  return path.join(root, 'ai', 'personas', kind);
}

// Read and parse `ai/personas/<kind>/<name>.md` under `root` (the app's working directory).
// Throws on a missing file or a missing/malformed/unknown-harness directive.
export function loadPersona(name: string, kind: PersonaKind, root: string = process.cwd()): Persona {
  const file = path.join(personasDir(root, kind), `${name}.md`);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No persona "${name}" (looked in ${path.join('ai', 'personas', kind, `${name}.md`)}).`);
  }
  const lines = raw.split('\n');
  const harness = parseDirective(name, (lines[0] ?? '').trim());
  // An optional second `[//]: #` comment line lists the persona's tools; anything else (a blank
  // line, an ordinary comment, or prose) starts the body, so existing personas are unaffected.
  const secondLine = (lines[1] ?? '').trim();
  const hasTools = isPersonaToolsLine(secondLine);
  const tools = hasTools ? parsePersonaTools(name, secondLine) : [];
  const body = lines.slice(hasTools ? 2 : 1).join('\n').trim();
  return { name, harness, body, tools };
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
