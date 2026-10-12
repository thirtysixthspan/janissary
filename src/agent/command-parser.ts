import type { AgentLaunch } from './types.js';

type Token = { value: string; start: number; end: number };
type Fields = { host?: string; inTab: boolean; group?: string; workspace?: string; skills: string[]; model?: string; effort?: string };
type ParseStep = { next: number } | { error: string };

function skipSpaces(input: string, start: number): number {
  let index = start;
  while (/\s/.test(input[index] ?? '')) index++;
  return index;
}

function readToken(input: string, start: number): Token | undefined {
  let index = start;
  let value = '';
  let quote = '';
  while (index < input.length) {
    const char = input[index] ?? '';
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\\' && input[index + 1] === quote) value += input[++index];
      else value += char;
      index++;
    } else if (char === '"' || char === "'") {
      quote = char;
      index++;
    } else if (/\s/.test(char)) break;
    else {
      value += char;
      index++;
    }
  }
  return quote ? undefined : { value, start, end: index };
}

function tokenize(input: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    index = skipSpaces(input, index);
    if (index === input.length) break;
    const token = readToken(input, index);
    if (!token) return undefined;
    tokens.push(token);
    index = token.end;
    const previous = tokens.at(-2)?.value.toLowerCase();
    const beforePrevious = tokens.at(-3)?.value.toLowerCase();
    const executeContinuesHeader = ['in', 'with', 'using'].includes(previous ?? '')
      || previous === 'on'
      || (previous === 'a' && beforePrevious === 'in')
      || (previous === 'skill' && beforePrevious === 'with')
      || (previous === 'effort' && beforePrevious === 'with')
      || (previous === 'model' && beforePrevious === 'using')
      || (['group', 'workspace'].includes(previous ?? '') && beforePrevious === 'in');
    if (token.value.toLowerCase() === 'execute' && !executeContinuesHeader) break;
  }
  return tokens;
}

function parseError(message: string): { error: string } {
  return { error: `Agent: ${message}.` };
}

function assign(fields: Fields, seen: Set<string>, key: string, value: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  switch (key) {
    case 'host': { fields.host = value; break; }
    case 'group': { fields.group = value; break; }
    case 'workspace': { fields.workspace = value; break; }
    case 'model': { fields.model = value; break; }
    case 'effort': { fields.effort = value; break; }
    case 'tab': { fields.inTab = true; break; }
    default: { break; }
  }
  return true;
}

function parseNamedClause(words: string[], index: number, fields: Fields, seen: Set<string>): ParseStep | undefined {
  const word = words[index]?.toLowerCase();
  if (!['on', 'with', 'using'].includes(word ?? '')) return undefined;
  const clause = word === 'on' ? 'host' : words[index + 1]?.toLowerCase();
  const valueIndex = index + (word === 'on' ? 1 : 2);
  const value = words[valueIndex];
  const label = word === 'on' ? 'on' : `${word} ${clause ?? ''}`.trim();
  if (!value || value.toLowerCase() === 'execute') return { error: `Agent: missing value for ${label}.` };
  if (word === 'with' && clause === 'skill') {
    fields.skills.push(value);
    return { next: valueIndex + 1 };
  }
  const key = word === 'on' ? 'host' : word === 'using' && clause === 'model' ? 'model' : word === 'with' && clause === 'effort' ? 'effort' : '';
  if (!key) return { error: `Agent: unknown clause "${word} ${clause ?? ''}".` };
  if (!assign(fields, seen, key, value)) return { error: `Agent: duplicate clause "${label}".` };
  return { next: valueIndex + 1 };
}

function parseLocationClause(words: string[], index: number, fields: Fields, seen: Set<string>): ParseStep | undefined {
  if (words[index]?.toLowerCase() !== 'in') return undefined;
  const second = words[index + 1]?.toLowerCase();
  if (second === 'a' && words[index + 2]?.toLowerCase() === 'tab') {
    if (!assign(fields, seen, 'tab', 'true')) return { error: 'Agent: duplicate clause "in a tab".' };
    return { next: index + 3 };
  }
  const value = words[index + 2];
  if (!value || value.toLowerCase() === 'execute') return { error: `Agent: missing value for in ${second ?? ''}.` };
  if (second !== 'group' && second !== 'workspace') return { error: `Agent: unknown clause "in ${second ?? ''}".` };
  if (!assign(fields, seen, second, value)) return { error: `Agent: duplicate clause "in ${second}".` };
  return { next: index + 3 };
}

function consumeClause(words: string[], index: number, fields: Fields, seen: Set<string>): ParseStep {
  const step = parseNamedClause(words, index, fields, seen) ?? parseLocationClause(words, index, fields, seen);
  return step ?? { error: `Agent: expected launch clause or final execute, got "${words[index]}".` };
}

export function parseAgentCommand(input: string): AgentLaunch | { error: string } {
  const tokens = tokenize(input);
  if (!tokens) return parseError('malformed quoted value');
  const words = tokens.map(({ value }) => value);
  const fields: Fields = { inTab: false, skills: [] };
  const seen = new Set<string>();
  let index = words[0]?.toLowerCase() === 'agent' ? 1 : 0;
  while (index < words.length && words[index]?.toLowerCase() !== 'execute') {
    const step = consumeClause(words, index, fields, seen);
    if ('error' in step) return { error: step.error };
    index = step.next;
  }
  if (words[index]?.toLowerCase() !== 'execute') return parseError('missing execute clause');
  const taskStart = skipSpaces(input, tokens[index]?.end ?? input.length);
  const taskToken = readToken(input, taskStart);
  if (!taskToken) return parseError('malformed quoted value');
  if (!taskToken.value) return parseError('missing task after execute');
  const parameters = input.slice(taskToken.end);
  return Object.freeze({ ...fields, skills: Object.freeze([...new Set(fields.skills)]), task: taskToken.value, parameters });
}
