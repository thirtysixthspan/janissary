import type { Persona } from '../personas.js';
import { SUGGESTION_FORMAT } from './reply-format.js';
import { TRUST_FRAMING_INSTRUCTIONS } from './framing.js';

// The monitor's own instructions ride along with the first prompt sent on the owner tab's core
// role session: what the persona watches, how it must reply, and how delimited target content is
// to be treated. The core pipeline supplies the role's grant/tooling primer and owns the
// connection; later monitor prompts carry only framed batches.
export function monitorFirstPrompt(persona: Persona, delimiter: string): string {
  return [persona.body, SUGGESTION_FORMAT, TRUST_FRAMING_INSTRUCTIONS(delimiter)].join('\n\n');
}
