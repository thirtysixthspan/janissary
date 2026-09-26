import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { modelsFor } from '../harness/models.js';

export type MonitorCompletions = { personas: string[]; names: string[]; targets: string[] };

// Complete `monitor`/`unmonitor` arguments. Which catalog an argument draws from follows what the
// argument means: `monitor <persona>` chooses a persona to start, so it offers personas, while
// `unmonitor <name>` and `monitor ask <name>` address a monitor that is already running, so they
// offer the live monitor names — which are the persona names only until a profile gives one a name
// of its own. Later arguments are targets (tab labels or `group:<n>` tokens).
export function completeMonitorCommand(
  cursor: CompletionCursor,
  monitor: MonitorCompletions | undefined,
): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (!monitor || (command !== 'monitor' && command !== 'unmonitor')) return null;
  if (argumentIndex === 1) {
    const words = command === 'unmonitor' ? [...monitor.names, '--all'] : [...monitor.personas, 'ask'];
    return completeWord(cursor, words);
  }
  if (argumentIndex === 2 && command === 'monitor' && preceding[1]?.toLowerCase() === 'ask') {
    return completeWord(cursor, monitor.names);
  }
  if (argumentIndex >= 2 && preceding[1]?.toLowerCase() !== 'ask') {
    return completeWord(cursor, monitor.targets);
  }
  return null;
}

// Complete `search transcript` — the only subcommand, so argument 1 always offers it.
export function completeSearchCommand(cursor: CompletionCursor): CompletionResult | null {
  if (cursor.argumentIndex !== 1 || cursor.command !== 'search') return null;
  return completeWord(cursor, ['transcript']);
}

// Complete `syntax theme <name>` — argument 1 offers `theme`, argument 2 completes theme names.
export function completeSyntaxTheme(cursor: CompletionCursor, themes: string[]): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'syntax') return null;
  if (argumentIndex === 1) return completeWord(cursor, ['theme']);
  if (argumentIndex === 2 && preceding[1]?.toLowerCase() === 'theme') {
    return completeWord(cursor, themes);
  }
  return null;
}

// Complete `harness <name> ... --model <partial>` against the harness's known model catalog.
// The flag can appear anywhere after the harness name, so match on the token immediately
// preceding the cursor rather than a fixed argument index (mirrors completeScheduleTarget).
export function completeHarnessModel(cursor: CompletionCursor): CompletionResult | null {
  const { command, preceding } = cursor;
  if (command !== 'harness' || preceding.at(-1)?.toLowerCase() !== '--model') return null;
  const harnessName = preceding[1]?.toLowerCase();
  if (!harnessName) return null;
  return completeWord(cursor, modelsFor(harnessName));
}
