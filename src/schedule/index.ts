// Parsing and next-run math for the `schedule` command. Pure (no I/O) so it is fully
// unit-testable; callers (the command + the scheduler tick) own the side effects.

import type { ScheduleBodyResult, ScheduleParseResult } from './types.js';
import { parseAtSchedule, parseOnSchedule } from './helpers.js';
import { parseEverySchedule } from './every-schedule.js';
import { SCHEDULE_USAGE } from './usage.js';
export { SCHEDULE_USAGE } from './usage.js';
export { parseTimeOfDay, parseInterval, parseMonthDay } from './parsing.js';
export { nextOccurrenceOfTime, nextWeekday, computeNextRun } from './time.js';
export { fmtNextRun, formatSchedule, formatLateDuration } from './display.js';

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
    return parseAtSchedule(tokens, now);
  }

  if (head === 'on') {
    return parseOnSchedule(tokens, now);
  }

  if (head === 'every') {
    return parseEverySchedule(tokens, now);
  }

  return { error: SCHEDULE_USAGE };
}
