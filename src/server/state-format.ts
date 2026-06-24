import type { AgentState } from '../types.js';

// Format an agent's persisted state for the `state` command (ported from commands/state.ts).
function formatVal(v: unknown, maxLines = 10): string {
  if (v === undefined || v === null) return '<empty>';
  if (typeof v === 'string') return v || '<empty>';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '<empty>';
    const lines = v.flatMap((item) => {
      if (typeof item === 'object' && item !== null) {
        const e = item as Record<string, unknown>;
        return [
          `> ${e.input ?? ''}`,
          ...(typeof e.output === 'string' && e.output ? e.output.split('\n').map((l) => `  ${l}`) : ['  <empty>']),
        ];
      }
      return [`  - ${JSON.stringify(item)}`];
    });
    if (lines.length <= maxLines) return lines.join('\n');
    return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
  }
  if (typeof v === 'object') {
    const lines = Object.entries(v as Record<string, unknown>).map(([k, val]) => `  ${k}: ${formatVal(val)}`);
    if (lines.length <= maxLines) return lines.join('\n');
    return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
  }
  return String(v);
}

export function formatState(label: string, state: AgentState | null): string {
  if (!state) return `No state file found for "${label}".`;
  return Object.entries(state).map(([k, v]) => `${k}:\n${formatVal(v)}`).join('\n\n');
}
