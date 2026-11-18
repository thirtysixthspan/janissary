import { readToken, skipSpaces } from '../command/quoted-token.js';

export const SUBAGENT_FLAG_USAGE = 'Usage: subagent --role <role> [--task <file.md>] [--context <text>]';
export const SUBAGENT_JSON_USAGE = 'Usage: subagent {"role":"<role>","context":"<text>"}';

type SubagentFields = { role: string; task?: string; context?: string };
export type SubagentInvocation = SubagentFields & { form: 'flags' | 'json' };
export type SubagentParseResult = SubagentInvocation | { error: string };

const FLAGS = ['--role', '--task', '--context'] as const;
const JSON_FIELDS = ['role', 'task', 'context'] as const;

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function subagentFields(role: unknown, task: unknown, context: unknown): SubagentFields | undefined {
  if (!present(role)) return undefined;
  if (task !== undefined && !present(task)) return undefined;
  if (context !== undefined && typeof context !== 'string') return undefined;
  if (task === undefined && !present(context)) return undefined;
  return {
    role,
    ...(task !== undefined && { task }),
    ...(context !== undefined && { context }),
  };
}

function flagError(): { error: string } {
  return { error: SUBAGENT_FLAG_USAGE };
}

function jsonError(): { error: string } {
  return { error: SUBAGENT_JSON_USAGE };
}

function parseFlags(argument: string): SubagentParseResult {
  const tokens: string[] = [];
  let index = 0;
  while (index < argument.length) {
    index = skipSpaces(argument, index);
    if (index >= argument.length) break;
    const token = readToken(argument, index);
    if (!token) return flagError();
    tokens.push(token.value);
    index = token.end;
  }

  const seen = new Set<string>();
  const values: Partial<Record<(typeof FLAGS)[number], string>> = {};
  for (let cursor = 0; cursor < tokens.length; cursor += 2) {
    const flag = tokens[cursor];
    if (!flag || !FLAGS.includes(flag as (typeof FLAGS)[number])) return flagError();
    const value = tokens[cursor + 1];
    if (seen.has(flag) || value === undefined) return flagError();
    seen.add(flag);
    values[flag as (typeof FLAGS)[number]] = value;
  }

  const parsed = subagentFields(values['--role'], values['--task'], values['--context']);
  return parsed === undefined ? flagError() : { form: 'flags', ...parsed };
}

function parseJson(argument: string): SubagentParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(argument);
  } catch {
    return jsonError();
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return jsonError();
  const record = decoded as Record<string, unknown>;
  if (Object.keys(record).some((key) => !JSON_FIELDS.includes(key as (typeof JSON_FIELDS)[number]))) {
    return jsonError();
  }
  const parsed = subagentFields(record.role, record.task, record.context);
  return parsed === undefined ? jsonError() : { form: 'json', ...parsed };
}

export function parseSubagentCommand(text: string): SubagentParseResult {
  const start = skipSpaces(text, 0);
  const first = readToken(text, start);
  const argumentStart = first?.value.toLowerCase() === 'subagent' ? first.end : start;
  const argument = text.slice(argumentStart).trim();
  return argument.startsWith('{') ? parseJson(argument) : parseFlags(argument);
}
