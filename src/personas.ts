import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// AI monitor personas: markdown files in `ai/personas/`. The filename (without `.md`)
// is the persona name used on the `monitor` command line. The first line is a required
// harness directive; the rest of the file is the monitoring session's startup prompt.

export type PersonaHarness = {
  harness: 'opencode' | 'claude';
  model: string;
  // opencode: variant (e.g. "max"); claude: thinking effort (e.g. "high").
  variant: string;
};

export type Persona = {
  name: string;
  harness: PersonaHarness;
  body: string;
};

const PERSONAS_DIR = path.join('ai', 'personas');

function personasDir(root: string): string {
  return path.join(root, PERSONAS_DIR);
}

// Directive grammar (line 1): `[//]: # <harness>:<model>:<variant>`. The model may
// itself contain colons or spaces (e.g. "DeepSeek V4 Flash"), so split on the first
// colon (harness) and the last colon (variant), keeping everything between as the model.
function parseDirective(name: string, line: string): PersonaHarness {
  const prefix = '[//]: # ';
  if (!line.startsWith(prefix)) {
    throw new Error(`Persona "${name}" has no harness directive. First line must be: [//]: # <harness>:<model>:<variant>.`);
  }
  const spec = line.slice(prefix.length).trim();
  const first = spec.indexOf(':');
  const last = spec.lastIndexOf(':');
  if (first === -1 || first === last) {
    throw new Error(`Persona "${name}" has a malformed harness directive. Expected: [//]: # <harness>:<model>:<variant>.`);
  }
  const harness = spec.slice(0, first);
  if (harness !== 'opencode' && harness !== 'claude') {
    throw new Error(`Unknown harness "${harness}" in persona "${name}" (expected opencode or claude).`);
  }
  const model = spec.slice(first + 1, last).trim();
  const variant = spec.slice(last + 1).trim();
  if (!model || !variant) {
    throw new Error(`Persona "${name}" has a malformed harness directive. Expected: [//]: # <harness>:<model>:<variant>.`);
  }
  return { harness, model, variant };
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
  const newline = raw.indexOf('\n');
  const firstLine = newline === -1 ? raw : raw.slice(0, newline);
  const body = newline === -1 ? '' : raw.slice(newline + 1).trim();
  return { name, harness: parseDirective(name, firstLine.trim()), body };
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
