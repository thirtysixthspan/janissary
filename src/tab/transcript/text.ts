import type { LogEntry } from '../types.js';

// Plain-text rendering of a tab's transcript for the "open transcript" clipboard-icon
// affordance: each entry's input (prefixed like a prompt) followed by its output, blank-line
// separated. Mirrors monitor/framing.ts's single-entry framing, without its security delimiter
// (this text never crosses back into a model prompt).
export function transcriptText(log: readonly LogEntry[]): string {
  return log
    .map((entry) => [entry.input && `> ${entry.input}`, entry.output].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
