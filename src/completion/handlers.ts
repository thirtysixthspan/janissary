import type { CompletionResult } from '../types.js';
import { completeWord } from './helpers.js';
import { modelsFor } from '../harness/models.js';
export { completeBrowserCommand } from './browser.js';
export { completeAgentName, completeSendTarget, completeScheduleTarget, completeConnectionClose } from './target-handlers.js';

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

// Complete `harness <name> ... --model <partial>` against the harness's known model catalog.
// The flag can appear anywhere after the harness name, so match on the token immediately
// preceding the cursor rather than a fixed argument index (mirrors completeScheduleTarget).
export function completeHarnessModel(
  command: string,
  preceding: string[],
  token: string,
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (command !== 'harness' || preceding.at(-1)?.toLowerCase() !== '--model') return null;
  const harnessName = preceding[1]?.toLowerCase();
  if (!harnessName) return null;
  return completeWord(token, '', modelsFor(harnessName), ' ', before, after, tokenStart);
}


