import { positiveInteger } from '../positive-integer.js';

export type FileReadArgs = {
  path: string;
  offset: number;
  limit: number;
};

export const FILE_READ_MAX_LIMIT = 2000;

export const FILE_READ_USAGE = 'Usage: file read <path> [--offset <line>] [--limit <lines>]';

type ScannedArgs = Partial<FileReadArgs>;

function scanArguments(tokens: string[]): ScannedArgs | undefined {
  const scanned: ScannedArgs = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--offset' || token === '--limit') {
      const key = token === '--offset' ? 'offset' : 'limit';
      const value = positiveInteger(tokens[index + 1]);
      if (value === undefined || scanned[key] !== undefined) return undefined;
      scanned[key] = value;
      index += 1;
    } else if (token.startsWith('--') || scanned.path !== undefined) {
      return undefined;
    } else {
      scanned.path = token;
    }
  }
  return scanned;
}

export function parseFileRead(input: string): FileReadArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file' || subcommand?.toLowerCase() !== 'read') return { error: FILE_READ_USAGE };
  const scanned = scanArguments(rest);
  if (scanned?.path === undefined) return { error: FILE_READ_USAGE };
  const limit = scanned.limit ?? FILE_READ_MAX_LIMIT;
  if (limit > FILE_READ_MAX_LIMIT) return { error: FILE_READ_USAGE };
  return { path: scanned.path, offset: scanned.offset ?? 1, limit };
}

export const FILE_READ_PRIMER = [
  'To read a file in the workspace, end your reply with one line:',
  'file read <path> [--offset <line>] [--limit <lines>]',
  'Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.',
].join('\n');

export function isFileReadCommandLine(line: string): boolean {
  return /^file\s+read(\s|$)/i.test(line);
}
