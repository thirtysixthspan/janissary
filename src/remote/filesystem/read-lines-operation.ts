import { requireString, stringValue } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { readWorkspaceLines } from '../../file-read/read.js';
import { FILE_READ_MAX_LIMIT } from '../../file-read/command.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function lineOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function lineLimit(value: unknown): value is number {
  return lineOffset(value) && value <= FILE_READ_MAX_LIMIT;
}

function requireInteger(value: unknown, check: (value: unknown) => value is number): number {
  if (!check(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

export const readLinesOperation = descriptorFor<'read-lines'>()({
  valid: (args) => stringValue(args.path)
    && (args.offset === undefined || lineOffset(args.offset))
    && (args.limit === undefined || lineLimit(args.limit)),
  decode: (args) => ({
    path: requireString(args.path),
    ...(args.offset !== undefined && { offset: requireInteger(args.offset, lineOffset) }),
    ...(args.limit !== undefined && { limit: requireInteger(args.limit, lineLimit) }),
  }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['read-lines'],
  run: (context, args) => ({
    text: readWorkspaceLines(context.root, {
      path: args.path, offset: args.offset ?? 1, limit: args.limit ?? FILE_READ_MAX_LIMIT,
    }),
  }),
});
