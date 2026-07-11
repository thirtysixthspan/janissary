export type PersonaHarness = {
  harness: 'opencode' | 'claude';
  model: string;
  variant: string;
};

// The only tools a persona may opt into (see `[//]: # tools:` config line). Every other tool stays
// denied; a persona that declares none is fully tool-less (today's behavior).
export const SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch'];

const COMMENT_PREFIX = '[//]: # ';

// Whether a line is the optional `[//]: # tools: …` config comment (case-insensitive label).
export function isPersonaToolsLine(line: string): boolean {
  if (!line.startsWith(COMMENT_PREFIX)) return false;
  return line.slice(COMMENT_PREFIX.length).trimStart().toLowerCase().startsWith('tools:');
}

// Parse a `[//]: # tools: a, b` line into a de-duplicated, lowercased tool list. Entries are
// validated against SUPPORTED_PERSONA_TOOLS; an unknown tool throws (fail loud, like a bad
// directive), so a persona never looks enabled when it isn't. An empty list is allowed.
export function parsePersonaTools(name: string, line: string): string[] {
  const content = line.slice(COMMENT_PREFIX.length).trimStart();
  const afterLabel = content.slice(content.indexOf(':') + 1);
  const entries = afterLabel.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const result: string[] = [];
  for (const entry of entries) {
    if (!SUPPORTED_PERSONA_TOOLS.includes(entry)) {
      throw new Error(`Persona "${name}" requests unknown tool "${entry}" (supported: ${SUPPORTED_PERSONA_TOOLS.join(', ')}).`);
    }
    if (!result.includes(entry)) result.push(entry);
  }
  return result;
}

export function parseDirective(name: string, line: string): PersonaHarness {
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
