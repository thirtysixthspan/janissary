import type { MonitorTarget } from '../types.js';

// Pure parsing for the monitor commands and the monitoring AI's reply format.

export type ParsedMonitor = { persona: string; targets: MonitorTarget[] };
export type ParsedMonitorAsk = { ask: true; persona: string; question: string };
export type ParsedUnmonitor = { all: true } | { persona: string; target?: MonitorTarget };

// A target argument: `group:<n>` or a tab label.
function parseTarget(word: string): MonitorTarget | { error: string } {
  const group = /^group:(\d+)$/i.exec(word);
  if (group) return { kind: 'group', group: Number(group[1]) };
  if (word.includes(':')) return { error: `Bad target "${word}" (expected a tab label or group:<n>).` };
  return { kind: 'tab', label: word };
}

// `monitor <persona> [target...]` — no targets means inline mode (watch the current tab).
// `monitor ask <persona> <question>` — query the running monitor's ACP directly.
export function parseMonitorCommand(input: string): ParsedMonitor | ParsedMonitorAsk | { error: string } {
  const words = input.trim().split(/\s+/).slice(1);
  if (words[0] === 'ask') {
    const persona = words[1];
    const question = words.slice(2).join(' ');
    if (!persona || !question) return { error: 'Usage: monitor ask <persona> <question>' };
    return { ask: true, persona, question };
  }
  const persona = words[0];
  if (!persona) return { error: 'Usage: monitor <persona> [tab|group:<n> ...]' };
  if (words[1] === 'ask') return { error: `Did you mean: monitor ask ${persona} <question>?` };
  const targets: MonitorTarget[] = [];
  for (const word of words.slice(1)) {
    const target = parseTarget(word);
    if ('error' in target) return target;
    targets.push(target);
  }
  return { persona, targets };
}

// `unmonitor --all` | `unmonitor <persona> [target]`
export function parseUnmonitorCommand(input: string): ParsedUnmonitor | { error: string } {
  const words = input.trim().split(/\s+/).slice(1);
  if (words[0] === '--all') return { all: true };
  const persona = words[0];
  if (!persona) return { error: 'Usage: unmonitor <persona> [tab|group:<n>] | unmonitor --all' };
  if (words.length === 1) return { persona };
  const target = parseTarget(words[1]);
  if ('error' in target) return target;
  return { persona, target };
}

// Extract a deliverable report from the monitoring AI's reply. The reply may contain
// anything; only the marker lines count:
//   [SUMMARY]: <text>                — a recap of activity (harness/page), no command
//   [SUGGESTION]: <text>             — an actionable suggestion
//   [COMMAND]: <optional command>    — a command that accompanies a suggestion
// An actionable suggestion wins when both markers are present; a summary carries no
// command. No marker → nothing to deliver (the persona is told silence is fine).
export function parseSuggestion(reply: string): { text: string; command?: string } | null {
  const suggestion = /^\[SUGGESTION]:\s*(.+)$/m.exec(reply)?.[1]?.trim();
  if (suggestion) {
    const command = /^\[COMMAND]:\s*(.+)$/m.exec(reply)?.[1]?.trim();
    return command ? { text: suggestion, command } : { text: suggestion };
  }
  const summary = /^\[SUMMARY]:\s*(.+)$/m.exec(reply)?.[1]?.trim();
  return summary ? { text: summary } : null;
}

// The output-format instructions appended to every persona's startup prompt.
export const SUGGESTION_FORMAT = [
  'Reply using exactly one of these formats:',
  'To recap what a harness or web page is doing (a summary, not a suggestion):',
  '[SUMMARY]: <one or two short sentences>',
  'To offer an actionable suggestion:',
  '[SUGGESTION]: <one short sentence>',
  '[COMMAND]: <a single command the user could run, only if one clearly applies>',
  'Only when you have genuinely nothing to report, reply with the single word: OK',
].join('\n');
