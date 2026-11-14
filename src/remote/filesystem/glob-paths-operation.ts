import { requireBoolean, requireString, stringValue } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { globWorkspace, GLOB_TIMEOUT_MS } from '../../file-glob/glob.js';
import { FILE_GLOB_DEFAULT_LIMIT, FILE_GLOB_MAX_LIMIT } from '../../file-glob/command.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function globLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= FILE_GLOB_MAX_LIMIT;
}

function requireLimit(value: unknown): number {
  if (!globLimit(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

export const globPathsOperation = descriptorFor<'glob-paths'>()({
  valid: (args) => stringValue(args.pattern)
    && (args.dir === undefined || stringValue(args.dir))
    && optionalBoolean(args.hidden) && optionalBoolean(args.dirs)
    && (args.limit === undefined || globLimit(args.limit)),
  decode: (args) => ({
    pattern: requireString(args.pattern),
    ...(args.dir !== undefined && { dir: requireString(args.dir) }),
    ...(args.hidden !== undefined && { hidden: requireBoolean(args.hidden) }),
    ...(args.dirs !== undefined && { dirs: requireBoolean(args.dirs) }),
    ...(args.limit !== undefined && { limit: requireLimit(args.limit) }),
  }),
  paths: (args) => (args.dir === undefined ? [] : [args.dir]), rootDestination: true,
  decodeResult: resultDecoders['glob-paths'],
  run: async (context, args) => ({
    text: await globWorkspace(context.root, {
      pattern: args.pattern,
      dir: args.dir,
      hidden: args.hidden ?? false,
      dirs: args.dirs ?? false,
      limit: args.limit ?? FILE_GLOB_DEFAULT_LIMIT,
    }, Date.now() + GLOB_TIMEOUT_MS),
  }),
});
