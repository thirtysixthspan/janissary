import type { CompletionResult } from '../types.js';
import { completeWord } from './helpers.js';
export { completeBrowserCommand } from './browser.js';

export function completeAgentName(
  command: string,
  argumentIndex: number,
  token: string,
  agents: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 1 || (command !== 'msg' && command !== 'broadcast')) {
    return null;
  }
  if (command === 'broadcast') {
    const segStart = token.lastIndexOf(',') + 1;
    return completeWord(token.slice(segStart), token.slice(0, segStart), [...agents, 'all'], '', before, after, tokenStart);
  }
  return completeWord(token, '', agents, ' ', before, after, tokenStart);
}

export function completeSendTarget(
  command: string,
  argumentIndex: number,
  token: string,
  labels: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 1 || (command !== 'send' && command !== 'queue')) return null;
  return completeWord(token, '', labels, ' ', before, after, tokenStart);
}

// Complete the target of a `schedule … in <tab>` clause against open tab labels. The clause
// sits right after the timer name (or `list`/`clear`) at argument 3, or after `cancel <name>`
// at argument 4 — anywhere else the word `in` belongs to the scheduled command itself.
export function completeScheduleTarget(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  labels: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (command !== 'schedule' || preceding.at(-1)?.toLowerCase() !== 'in') return null;
  const isClause = argumentIndex === 3 || (argumentIndex === 4 && preceding[1]?.toLowerCase() === 'cancel');
  if (!isClause) return null;
  return completeWord(token, '', labels, ' ', before, after, tokenStart);
}

// Complete `monitor`/`unmonitor` arguments: the first argument is a persona name (or
// `ask` / `--all`), later arguments are targets (tab labels or `group:<n>` tokens) —
// except after `monitor ask`, where the persona comes second.
export function completeMonitorCommand(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  monitor: { personas: string[]; targets: string[] } | undefined,
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (!monitor || (command !== 'monitor' && command !== 'unmonitor')) return null;
  if (argumentIndex === 1) {
    const extra = command === 'unmonitor' ? ['--all'] : ['ask'];
    return completeWord(token, '', [...monitor.personas, ...extra], ' ', before, after, tokenStart);
  }
  if (argumentIndex === 2 && command === 'monitor' && preceding[1]?.toLowerCase() === 'ask') {
    return completeWord(token, '', monitor.personas, ' ', before, after, tokenStart);
  }
  if (argumentIndex >= 2 && preceding[1]?.toLowerCase() !== 'ask') {
    return completeWord(token, '', monitor.targets, ' ', before, after, tokenStart);
  }
  return null;
}

// Complete `search transcript` — the only subcommand, so argument 1 always offers it.
export function completeSearchCommand(
  command: string,
  argumentIndex: number,
  token: string,
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 1 || command !== 'search') return null;
  return completeWord(token, '', ['transcript'], ' ', before, after, tokenStart);
}

// Complete `syntax theme <name>` — argument 1 offers `theme`, argument 2 completes theme names.
export function completeSyntaxTheme(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  themes: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (command !== 'syntax') return null;
  if (argumentIndex === 1) return completeWord(token, '', ['theme'], ' ', before, after, tokenStart);
  if (argumentIndex === 2 && preceding[1]?.toLowerCase() === 'theme') {
    return completeWord(token, '', themes, ' ', before, after, tokenStart);
  }
  return null;
}

export function completeConnectionClose(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  connections: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 2 || command !== 'connection' || preceding[1]?.toLowerCase() !== 'close') {
    return null;
  }
  return completeWord(token, '', connections, ' ', before, after, tokenStart);
}


