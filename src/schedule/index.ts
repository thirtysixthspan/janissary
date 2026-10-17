// Parsing and next-run math for the `schedule` command. Pure (no I/O) so it is fully
// unit-testable; callers (the command + the scheduler tick) own the side effects.

import type { ScheduleBodyResult, ScheduleParseResult } from './types.js';
import { parseAtSchedule, parseOnSchedule } from './helpers.js';
import { parseEverySchedule } from './every-schedule.js';
import { SCHEDULE_USAGE, SYSTEM_SCHEDULE_USAGE } from './usage.js';
import { isRunscriptName } from './system/runscript.js';

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

  if (head === 'system') return parseSystemSchedule(tokens.slice(1), now);

  if (head === 'list' || head === 'clear') {
    const clause = parseInClause(tokens, 1);
    if ('error' in clause) return clause;
    return head === 'list' ? { action: 'list', ...clause } : { action: 'clear', ...clause };
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

function parseSystemSchedule(tokens: string[], now: Date): ScheduleParseResult {
  const [first, second, ...rest] = tokens;
  if (!first) return { error: SYSTEM_SCHEDULE_USAGE };
  const action = first.toLowerCase();
  if (action === 'list' && second === undefined) return { scope: 'system', action: 'list' };
  if (action === 'clear' && second === undefined) return { scope: 'system', action: 'clear' };
  if (action === 'cancel' && second !== undefined && rest.length === 0) {
    return { scope: 'system', action: 'cancel', id: second };
  }
  if (['list', 'clear', 'cancel'].includes(action)) return { error: SYSTEM_SCHEDULE_USAGE };
  const marker = tokens.at(-2);
  const script = tokens.at(-1);
  if (marker?.toLowerCase() !== 'script' || !script || !isRunscriptName(script)) {
    return { error: SYSTEM_SCHEDULE_USAGE };
  }
  const form = parseScheduleBody([...tokens.slice(1, -2), 'script', script].join(' '), now);
  if ('error' in form || form.entry.command !== `script ${script}`) return { error: SYSTEM_SCHEDULE_USAGE };
  return { scope: 'system', action: 'add', entry: form.entry, name: first, script };
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
