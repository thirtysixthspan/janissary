import { positiveInteger } from '../positive-integer.js';
import { globPatternRefusal } from './pattern-limits.js';

export type FileGlobArgs = {
  pattern: string;
  dir: string | undefined;
  hidden: boolean;
  dirs: boolean;
  limit: number;
};

export const FILE_GLOB_DEFAULT_LIMIT = 100;

export const FILE_GLOB_MAX_LIMIT = 1000;

export const FILE_GLOB_USAGE = 'Usage: file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]';

type ScannedArgs = Partial<FileGlobArgs>;

function scanSwitch(scanned: ScannedArgs, key: 'hidden' | 'dirs'): number | undefined {
  if (scanned[key] !== undefined) return undefined;
  scanned[key] = true;
  return 1;
}

function scanPath(scanned: ScannedArgs, value: string | undefined): number | undefined {
  if (value === undefined || value.startsWith('--') || scanned.dir !== undefined) return undefined;
  scanned.dir = value;
  return 2;
}

function scanLimit(scanned: ScannedArgs, value: string | undefined): number | undefined {
  const limit = positiveInteger(value);
  if (limit === undefined || scanned.limit !== undefined) return undefined;
  scanned.limit = limit;
  return 2;
}

function scanFlag(scanned: ScannedArgs, flag: string, value: string | undefined): number | undefined {
  switch (flag) {
    case '--path': {
      return scanPath(scanned, value);
    }
    case '--limit': {
      return scanLimit(scanned, value);
    }
    case '--hidden': {
      return scanSwitch(scanned, 'hidden');
    }
    case '--dirs': {
      return scanSwitch(scanned, 'dirs');
    }
    default: {
      return undefined;
    }
  }
}

function scanArguments(tokens: string[]): ScannedArgs | undefined {
  const scanned: ScannedArgs = {};
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.startsWith('--')) {
      const consumed = scanFlag(scanned, token, tokens[index + 1]);
      if (consumed === undefined) return undefined;
      index += consumed;
    } else if (scanned.pattern === undefined) {
      scanned.pattern = token;
      index += 1;
    } else {
      return undefined;
    }
  }
  return scanned;
}

export function parseFileGlob(input: string): FileGlobArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file' || subcommand?.toLowerCase() !== 'glob') return { error: FILE_GLOB_USAGE };
  const scanned = scanArguments(rest);
  if (scanned?.pattern === undefined) return { error: FILE_GLOB_USAGE };
  const limit = scanned.limit ?? FILE_GLOB_DEFAULT_LIMIT;
  if (limit > FILE_GLOB_MAX_LIMIT) return { error: FILE_GLOB_USAGE };
  const refusal = globPatternRefusal(scanned.pattern);
  if (refusal !== undefined) return { error: refusal };
  return {
    pattern: scanned.pattern,
    dir: scanned.dir,
    hidden: scanned.hidden ?? false,
    dirs: scanned.dirs ?? false,
    limit,
  };
}

export const FILE_GLOB_PRIMER = [
  'To find files in the workspace by path, end your reply with one line:',
  'file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]',
  'Patterns are case-sensitive and relative to --path (default: the workspace root): ** spans folders, * stays within one name, ? is one character, {a,b} is either. Results are workspace-relative paths, at most 100 by default; hidden and git-ignored paths are skipped unless --hidden is given, and --dirs lists folders instead of files.',
  'Example: file glob **/*.test.ts --path src',
].join('\n');

export function isFileGlobCommandLine(line: string): boolean {
  return /^file\s+glob(\s|$)/i.test(line);
}

export type GlobResultFlags = {
  limit: number;
  truncated: boolean;
  timedOut: boolean;
};

export function formatGlobResult(paths: string[], { limit, truncated, timedOut }: GlobResultFlags): string {
  const lines = paths.length === 0 ? ['(no matches)'] : [...paths];
  if (truncated) {
    lines.push(`(showing the first ${limit} matches; narrow the pattern or raise --limit)`);
  } else if (timedOut) {
    lines.push('(search stopped after 30 seconds; narrow the pattern or --path)');
  }
  return lines.join('\n');
}
