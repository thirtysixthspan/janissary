import type { MonitorTarget } from '../types.js';
export { parseSuggestion, SUGGESTION_FORMAT } from './reply-format.js';

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
