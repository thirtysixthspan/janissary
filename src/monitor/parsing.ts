import type { MonitorTarget } from '../tab/types.js';
export { parseSuggestion, SUGGESTION_FORMAT } from './reply-format.js';

// Pure parsing for the monitor commands and the monitoring AI's reply format.

// `name` is the monitor's runtime identity — the registry key, the reporting tab's label, and what
// `unmonitor` and `monitor ask` address. For `monitor <persona>` it is the persona, because that
// command names one and takes the other from it; a profile-launched monitor can carry its own.
export type ParsedMonitor = { name: string; targets: MonitorTarget[] };
export type ParsedMonitorAsk = { ask: true; name: string; question: string };
export type ParsedUnmonitor = { all: true } | { name: string; target?: MonitorTarget };

// A target argument: `group:<n>` or a tab label.
function parseTarget(word: string): MonitorTarget | { error: string } {
  const group = /^group:(\d+)$/i.exec(word);
  if (group) return { kind: 'group', group: Number(group[1]) };
  if (word.includes(':')) return { error: `Bad target "${word}" (expected a tab label or group:<n>).` };
  return { kind: 'tab', label: word };
}

// `monitor <persona> [target...]` — no targets means inline mode (watch the current tab).
// `monitor ask <name> <question>` — query the running monitor's ACP directly.
export function parseMonitorCommand(input: string): ParsedMonitor | ParsedMonitorAsk | { error: string } {
  const words = input.trim().split(/\s+/).slice(1);
  if (words[0] === 'ask') {
    const name = words[1];
    const question = words.slice(2).join(' ');
    if (!name || !question) return { error: 'Usage: monitor ask <name> <question>' };
    return { ask: true, name, question };
  }
  const name = words[0];
  if (!name) return { error: 'Usage: monitor <persona> [tab|group:<n> ...]' };
  if (words[1] === 'ask') return { error: `Did you mean: monitor ask ${name} <question>?` };
  const targets: MonitorTarget[] = [];
  for (const word of words.slice(1)) {
    const target = parseTarget(word);
    if ('error' in target) return target;
    targets.push(target);
  }
  return { name, targets };
}

// `unmonitor --all` | `unmonitor <name> [target]`
export function parseUnmonitorCommand(input: string): ParsedUnmonitor | { error: string } {
  const words = input.trim().split(/\s+/).slice(1);
  if (words[0] === '--all') return { all: true };
  const name = words[0];
  if (!name) return { error: 'Usage: unmonitor <name> [tab|group:<n>] | unmonitor --all' };
  if (words.length === 1) return { name };
  const target = parseTarget(words[1]);
  if ('error' in target) return target;
  return { name, target };
}
