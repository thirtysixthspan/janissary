import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// AI monitor personas: markdown files in `ai/personas/`. The filename (without `.md`)
// is the persona name used on the `monitor` command line. The first line is a required
// harness directive; the rest of the file is the monitoring session's startup prompt.

import { parseDirective, isPersonaToolsLine, parsePersonaTools } from './persona-parsing.js';
import type { PersonaHarness } from './persona-parsing.js';
export type { PersonaHarness } from './persona-parsing.js';
export { parseDirective } from './persona-parsing.js';

export type Persona = {
  name: string;
  harness: PersonaHarness;
  body: string;
  // Tools the persona opted into via the `[//]: # tools:` line (see persona-parsing). Always
  // present — `[]` for a tool-less persona — so callers never branch on undefined.
  tools: string[];
};

const PERSONAS_DIR = path.join('ai', 'personas');

function personasDir(root: string): string {
  return path.join(root, PERSONAS_DIR);
}

// Read and parse `ai/personas/<name>.md` under `root` (the app's working directory).
// Throws on a missing file or a missing/malformed/unknown-harness directive.
export function loadPersona(name: string, root: string = process.cwd()): Persona {
  const file = path.join(personasDir(root), `${name}.md`);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No persona "${name}" (looked in ${path.join(PERSONAS_DIR, `${name}.md`)}).`);
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

// Persona names available for the `monitor` command (used by completion and errors).
export function listPersonas(root: string = process.cwd()): string[] {
  try {
    return readdirSync(personasDir(root))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
