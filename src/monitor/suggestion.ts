import type { MonitorSuggestion } from '../types.js';

// Marks inline suggestion entries so monitors never feed on their own output.
export const SUGGESTION_PREFIX = '💡';

// Builds the suggestion record delivered to either the owner tab's transcript (inline mode) or
// the persona's reporting tab (external mode).
export function buildSuggestion(
  parsed: { text: string; command?: string },
  personaName: string,
  about: string,
  id: string,
): MonitorSuggestion {
  return { ...parsed, id, timestamp: Date.now(), persona: personaName, about };
}

// Formats an inline-mode suggestion as it's appended to the owner tab's transcript.
export function formatInlineSuggestion(personaName: string, suggestion: MonitorSuggestion): string {
  const command = suggestion.command ? `\n${suggestion.command}` : '';
  return `${SUGGESTION_PREFIX} ${personaName}: ${suggestion.text}${command}`;
}
