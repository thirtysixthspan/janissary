import path from 'node:path';
import { requireString, stringValue } from './argument-checks.js';
import { fileFailureLine } from '../../file-failure.js';
import { formatFileRow } from '../../file-row.js';
import { checkLexicalPath } from '../../file-read/policy.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const statPathOperation = descriptorFor<'stat-path'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['stat-path'],
  run: async (context, args) => {
    const failure = checkLexicalPath(context.root, args.path);
    if (failure !== undefined) return { text: fileFailureLine(failure, args.path) ?? 'forbidden' };
    const relPath = path.relative(context.root, path.resolve(context.root, args.path));
    const stats = await context.filesystem.statRows(context.root, [relPath]);
    const stat = stats[relPath];
    if (stat === null || stat === undefined) return { text: fileFailureLine('File not found', args.path) ?? 'missing' };
    return { text: formatFileRow(path.basename(args.path), stat) };
  },
});
