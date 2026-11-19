import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { formatFileRow } from '../file-row.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { checkLexicalPath } from '../file-read/policy.js';
import { localReadRoot } from '../file-read/tab-read.js';
import type { Managers } from '../managers.js';
import { parseFileStat } from './command.js';

export async function statFileInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileStat(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  const requested = parsed.path;
  const failure = checkLexicalPath(root, requested);
  if (failure !== undefined) return fileFailureLine(failure, requested) ?? 'forbidden';
  const relPath = path.relative(root, path.resolve(root, requested));
  const stats = await port.statRows(root, [relPath]);
  const stat = stats[relPath];
  if (stat === null || stat === undefined) return fileFailureLine('File not found', requested) ?? 'missing';
  return formatFileRow(path.basename(requested), stat);
}
