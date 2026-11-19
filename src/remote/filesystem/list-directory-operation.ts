import { constants } from 'node:fs';
import path from 'node:path';
import { requireString, stringValue } from './argument-checks.js';
import { fileFailureLine } from '../../file-failure.js';
import { formatFileRow } from '../../file-row.js';
import { readRowStat } from '../../file-navigator/stats.js';
import { checkLexicalPath, isSecretPath } from '../../file-read/policy.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

const { S_IFDIR, S_IFMT } = constants;
const ZERO_STAT = { size: 0, modified: 0, mode: 0 };

export const listDirectoryOperation = descriptorFor<'list-directory'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['list-directory'],
  run: async (context, args) => {
    const failure = checkLexicalPath(context.root, args.path);
    if (failure !== undefined) return { text: fileFailureLine(failure, args.path) ?? 'forbidden' };
    const relPath = path.relative(context.root, path.resolve(context.root, args.path));
    const stat = readRowStat(path.resolve(context.root, relPath));
    if (stat === null) return { text: 'missing' };
    if ((stat.mode & S_IFMT) !== S_IFDIR) return { text: 'notdir' };
    const entries = await context.filesystem.readDirectory(context.root, relPath);
    const visible = entries.filter((entry) => !isSecretPath(entry.name));
    const paths = visible.map((entry) => path.posix.join(relPath, entry.name));
    const stats = await context.filesystem.statRows(context.root, paths);
    const rows = visible.map((entry, index) => formatFileRow(entry.name, stats[paths[index]] ?? ZERO_STAT));
    return { text: rows.length === 0 ? '(empty directory)' : rows.join('\n') };
  },
});
