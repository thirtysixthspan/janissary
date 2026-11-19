import { positiveInteger } from '../positive-integer.js';

export const FILE_HEAD_TAIL_DEFAULT_LINES = 10;
export const FILE_HEAD_TAIL_MAX_LINES = 2000;
export const FILE_HEAD_USAGE = 'Usage: file head <path> [-n <lines>]';
export const FILE_TAIL_USAGE = 'Usage: file tail <path> [-n <lines>]';

export type HeadTailArgs = {
  direction: 'head' | 'tail';
  path: string;
  count: number;
};

type ScannedArgs = { path: string; count: number };

function scanArguments(tokens: string[], usage: string): ScannedArgs | { error: string } {
  let path: string | undefined;
  let count: number | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-n') {
      if (count !== undefined) return { error: usage };
      const value = positiveInteger(tokens[index + 1]);
      if (value === undefined || value > FILE_HEAD_TAIL_MAX_LINES) return { error: usage };
      count = value;
      index += 1;
    } else if (token.startsWith('-') || path !== undefined) {
      return { error: usage };
    } else {
      path = token;
    }
  }
  if (path === undefined) return { error: usage };
  return { path, count: count ?? FILE_HEAD_TAIL_DEFAULT_LINES };
}

export function parseFileHeadTail(input: string): HeadTailArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file') return { error: FILE_HEAD_USAGE };
  if (subcommand?.toLowerCase() === 'head') {
    const scanned = scanArguments(rest, FILE_HEAD_USAGE);
    return 'error' in scanned ? scanned : { direction: 'head', ...scanned };
  }
  if (subcommand?.toLowerCase() === 'tail') {
    const scanned = scanArguments(rest, FILE_TAIL_USAGE);
    return 'error' in scanned ? scanned : { direction: 'tail', ...scanned };
  }
  return { error: FILE_HEAD_USAGE };
}
