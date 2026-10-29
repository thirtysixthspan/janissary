import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';

export type SystemScheduleCompletions = { names: string[]; scripts: string[] };

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function completeSystemSchedule(
  cursor: CompletionCursor,
  options: SystemScheduleCompletions | undefined,
): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'schedule') return null;
  if (argumentIndex === 1) return completeWord(cursor, ['system']);
  if (preceding[1]?.toLowerCase() !== 'system') return null;
  if (argumentIndex === 2) return completeWord(cursor, ['list', 'cancel', 'clear']);
  if (preceding[2]?.toLowerCase() === 'cancel' && argumentIndex === 3) {
    return completeWord(cursor, options?.names ?? []);
  }
  if (argumentIndex === 3) return completeWord(cursor, ['at', 'on', 'every']);
  if (preceding.at(-1)?.toLowerCase() === 'script') return completeWord(cursor, options?.scripts ?? []);
  if (preceding[3]?.toLowerCase() === 'every') {
    if (argumentIndex === 4) return completeWord(cursor, ['day', ...WEEKDAYS]);
    if (['day', ...WEEKDAYS].includes(preceding[4]?.toLowerCase() ?? '') && argumentIndex === 5) {
      return completeWord(cursor, ['at']);
    }
  }
  if (shouldCompleteDate(cursor)) {
    return completeWord(cursor, ['at']);
  }
  return null;
}

function shouldCompleteDate({ preceding, argumentIndex }: CompletionCursor): boolean {
  return preceding[3]?.toLowerCase() === 'on' && argumentIndex >= 5
    && (/^\d{1,2}\/\d{1,2}$/.test(preceding[4] ?? '')
      || Boolean(preceding[5] && /^\d{1,2}(st|nd|rd|th)?$/i.test(preceding[5])));
}
