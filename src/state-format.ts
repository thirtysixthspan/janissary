import type { AgentState } from './agent/types.js';

// Format an agent's state for the `state` command (ported from commands/state.ts). The reply is
// markdown: every surface that shows it renders markdown, an agent tab's transcript and a shell tab's
// terminal alike, so each field is a bold name with its value in code, where its layout survives.
function formatValue(v: unknown, maxLines = 10): string {
  if (v === undefined || v === null) return '<empty>';
  if (typeof v === 'string') return v || '<empty>';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '<empty>';
    const lines = v.flatMap((item) => {
      if (typeof item === 'object' && item !== null) {
        const entry = item as Record<string, unknown>;
        return [
          `> ${entry.input ?? ''}`,
          ...(typeof entry.output === 'string' && entry.output ? entry.output.split('\n').map((l) => `  ${l}`) : ['  <empty>']),
        ];
      }
      return [`  - ${JSON.stringify(item)}`];
    });
    if (lines.length <= maxLines) return lines.join('\n');
    return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
  }
  if (typeof v === 'object') {
    const lines = Object.entries(v as Record<string, unknown>).map(([k, value]) => `  ${k}: ${formatValue(value)}`);
    if (lines.length <= maxLines) return lines.join('\n');
    return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
  }
  return String(v);
}

// A run of backticks one longer than any run inside `text`, and never shorter than `minimum`, so a
// value holding backticks cannot close the code span or block around it early.
function fence(text: string, minimum: number): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/gu)].map((match) => match[0].length));
  return '`'.repeat(Math.max(minimum, longest + 1));
}

function inlineCode(text: string): string {
  const marks = fence(text, 1);
  const padded = text.startsWith('`') || text.endsWith('`') ? ` ${text} ` : text;
  return `${marks}${padded}${marks}`;
}

function codeBlock(text: string): string {
  const marks = fence(text, 3);
  return `${marks}\n${text}\n${marks}`;
}

function formatField(key: string, value: unknown): string {
  const text = formatValue(value);
  const scalar = (typeof value !== 'object' || value === null) && !text.includes('\n');
  return scalar ? `**${key}**: ${inlineCode(text)}` : `**${key}**:\n\n${codeBlock(text)}`;
}

export function formatState(label: string, state: AgentState | null): string {
  if (!state) return `No state file found for "${label}".`;
  return Object.entries(state).map(([k, v]) => formatField(k, v)).join('\n\n');
}
