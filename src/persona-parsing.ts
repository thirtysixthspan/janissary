export type PersonaHarness = {
  harness: 'opencode' | 'claude';
  model: string;
  variant: string;
};

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
