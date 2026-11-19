import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { isHostName } from '../plugins/hosts/hosts-values.js';
import { parseShellArgument } from '../plugins/shell/parse-argument.js';
import { parseHarnessCommand } from '../harness/command-parse.js';
import { parseAgentCommand } from '../agent/command-parser.js';

function placeholderFor(text: string, seed: string): string {
  let value = seed;
  while (text.includes(value)) value = `_${value}`;
  return value;
}

function hasOpenQuote(text: string): boolean {
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? '';
    if (quote !== '') {
      if (char === '\\') {
        index++;
        continue;
      }
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  return quote !== '';
}

function reportsHost(command: string, probe: string, placeholder: string): boolean {
  if (command === 'shell') {
    const parsed = parseShellArgument(probe.replace(/^shell\b\s*/iu, ''));
    return !('error' in parsed) && parsed.remote === placeholder;
  }
  if (command === 'harness') {
    const parsed = parseHarnessCommand(probe);
    return !('error' in parsed) && 'remote' in parsed && parsed.remote?.address === placeholder;
  }
  const parsed = parseAgentCommand(`${probe} execute ${placeholderFor(probe, '__task__')}`);
  return !('error' in parsed) && parsed.host === placeholder;
}

export function isSavedHostSlot(cursor: CompletionCursor): boolean {
  const { command, argumentIndex, preceding, before, after, token, tokenStart } = cursor;
  if (hasOpenQuote(before) || !(after === '' || /^\s/u.test(after))) return false;
  if (token !== '' && !isHostName(token)) return false;
  if (command === 'ssh') return argumentIndex === 1 && /^\s*$/u.test(after);
  if (command === 'hosts') return argumentIndex === 2 && preceding[1]?.toLowerCase() === 'remove';
  if (!['shell', 'harness', 'agent'].includes(command)) return false;
  if (preceding.at(-1)?.toLowerCase() !== 'on') return false;
  const placeholder = placeholderFor(before, '__host__');
  return reportsHost(command, before.slice(0, tokenStart) + placeholder, placeholder);
}

export function completeSavedHost(cursor: CompletionCursor, names: readonly string[]): CompletionResult | null {
  if (!isSavedHostSlot(cursor)) return null;
  const suffix = /^\s/u.test(cursor.after) ? '' : ' ';
  const result = completeWord(cursor, names, { caseInsensitive: true, suffix });
  return result.matches.length === 0 ? null : result;
}
