import { lstatSync } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { formatFileRow } from '../file-row.js';
import type { FileNavigatorEntry } from '../file-navigator/index.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { checkLexicalPath, isSecretPath } from '../file-read/policy.js';
import { localReadRoot } from '../file-read/tab-read.js';
import type { Managers } from '../managers.js';
import { parseFileList } from './command.js';

const ZERO_STAT = { size: 0, modified: 0, mode: 0 };

function filesystemFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'forbidden';
}

export async function listFilesInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileList(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  const requested = parsed.path;
  const failure = checkLexicalPath(root, requested);
  if (failure !== undefined) return fileFailureLine(failure, requested) ?? 'forbidden';
  const relPath = path.relative(root, path.resolve(root, requested));
  try {
    if (!lstatSync(path.resolve(root, relPath)).isDirectory()) return 'notdir';
  } catch (error) {
    return filesystemFailure(error);
  }
  let entries: FileNavigatorEntry[];
  try {
    entries = await port.readDirectory(root, relPath);
  } catch {
    return 'forbidden';
  }
  const visible = entries.filter((entry) => !isSecretPath(entry.name));
  const paths = visible.map((entry) => path.posix.join(relPath, entry.name));
  const stats = await port.statRows(root, paths);
  const rows = visible.map((entry, index) => formatFileRow(entry.name, stats[paths[index]] ?? ZERO_STAT));
  return rows.length === 0 ? '(empty directory)' : rows.join('\n');
}
