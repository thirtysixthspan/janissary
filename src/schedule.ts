// Parsing and next-run math for the `schedule` command. Pure (no I/O) so it is fully
// unit-testable; callers (the command + the scheduler tick) own the side effects.

import type { ScheduleEntry, ScheduleParseResult } from './types.js';
import { parseAtSchedule, parseOnSchedule, parseEverySchedule } from './schedule-helpers.js';
import { parseTimeOfDay, parseInterval, parseMonthDay } from './schedule-parsing.js';
export { parseTimeOfDay, parseInterval, parseMonthDay } from './schedule-parsing.js';
import { nextOccurrenceOfTime, nextWeekday, nextDateTime } from './schedule-time.js';
export { nextOccurrenceOfTime, nextWeekday, computeNextRun } from './schedule-time.js';
import { fmtTime } from './schedule-display.js';
export { fmtNextRun, formatSchedule } from './schedule-display.js';

// The body parser produces an add result without a name; the wrapper attaches the leading
// positional name afterwards.
type ScheduleBodyResult = { action: 'add'; entry: Omit<ScheduleEntry, 'id'> } | { error: string };

export const SCHEDULE_USAGE =
  'Usage: schedule NAME [in TAB] <at TIME | on DATE [at TIME] | every N(m|h|d|w) | every DAY at TIME> COMMAND'
  + ' | schedule list [in TAB] | schedule cancel <name> [in TAB] | schedule clear [in TAB]';



// Parse a trailing `in <tab>` clause starting at `tokens[index]`. Returns the target label,
// an empty object when the clause is absent, or an error when it is malformed or followed
// by extra tokens (the clause must end the command).
function parseInClause(tokens: string[], index: number): { target?: string } | { error: string } {
  const [keyword, target, ...extra] = tokens.slice(index);
  if (keyword === undefined) return {};
  if (keyword.toLowerCase() !== 'in' || target === undefined || extra.length > 0) return { error: SCHEDULE_USAGE };
  return { target };
}

export function parseScheduleCommand(rest: string, now: Date): ScheduleParseResult {
  const trimmed = rest.trim();
  if (!trimmed) return { error: SCHEDULE_USAGE };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0].toLowerCase();

  if (head === 'list' || head === 'clear') {
    const clause = parseInClause(tokens, 1);
    if ('error' in clause) return clause;
    return { action: head, ...clause };
  }
  if (head === 'cancel') {
    if (!tokens[1]) return { error: 'Usage: schedule cancel <name> [in TAB]' };
    const clause = parseInClause(tokens, 2);
    if ('error' in clause) return clause;
    return { action: 'cancel', id: tokens[1], ...clause };
  }

  // Otherwise the first token names the timer (becoming its id, shown in the schedule window
  // and used by `schedule cancel <name>`), an optional `in <tab>` picks the tab the timer
  // belongs to, and the remainder is the schedule form.
  const name = tokens[0];
  let bodyTokens = tokens.slice(1);
  let target: string | undefined;
  if (bodyTokens[0]?.toLowerCase() === 'in') {
    if (!bodyTokens[1]) return { error: SCHEDULE_USAGE };
    target = bodyTokens[1];
    bodyTokens = bodyTokens.slice(2);
  }
  const body = parseScheduleBody(bodyTokens.join(' '), now);
  if ('error' in body) return body;
  return { ...body, name, ...(target !== undefined && { target }) };
}

function parseScheduleBody(rest: string, now: Date): ScheduleBodyResult {
  const trimmed = rest.trim();
  if (!trimmed) return { error: SCHEDULE_USAGE };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0].toLowerCase();

  if (head === 'at') {
    return parseAtSchedule(tokens, now, parseTimeOfDay, fmtTime, nextOccurrenceOfTime);
  }

  if (head === 'on') {
    return parseOnSchedule(tokens, now, parseMonthDay, parseTimeOfDay, fmtTime, nextDateTime);
  }

  if (head === 'every') {
    return parseEverySchedule(tokens, now, parseInterval, parseTimeOfDay, fmtTime, nextOccurrenceOfTime, nextWeekday);
  }

  return { error: SCHEDULE_USAGE };
}
