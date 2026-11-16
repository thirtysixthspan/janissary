import type { FileGrepArgs } from '../../file-grep/command.js';
import { SEARCH_MAX_RESULTS } from '../../search/types.js';
import { requireBoolean, requireString, stringValue } from './argument-checks.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function grepLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= SEARCH_MAX_RESULTS;
}

function requireLimit(value: unknown): number {
  if (!grepLimit(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

function optionalPath(value: unknown): value is string | undefined {
  return value === undefined || stringValue(value);
}

export function validFileGrepArgs(args: Record<string, unknown>): boolean {
  return stringValue(args.pattern) && stringValue(args.include) && stringValue(args.exclude)
    && typeof args.literal === 'boolean' && typeof args.word === 'boolean' && typeof args.caseSensitive === 'boolean'
    && optionalPath(args.path) && grepLimit(args.limit);
}

export function decodeFileGrepArgs(args: Record<string, unknown>): FileGrepArgs {
  return {
    pattern: requireString(args.pattern),
    include: requireString(args.include),
    exclude: requireString(args.exclude),
    literal: requireBoolean(args.literal),
    word: requireBoolean(args.word),
    caseSensitive: requireBoolean(args.caseSensitive),
    limit: requireLimit(args.limit),
    path: args.path === undefined ? undefined : requireString(args.path),
  };
}
