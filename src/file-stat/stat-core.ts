import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { formatFileRow } from '../file-row.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { checkLexicalPath, createRequestedTargetCheck } from '../file-read/policy.js';

export async function statFile(
  root: string, requested: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const failure = checkLexicalPath(root, requested);
  if (failure !== undefined) return fileFailureLine(failure, requested) ?? 'forbidden';
  if (createRequestedTargetCheck(root)(requested) !== undefined) return 'forbidden';
  const relPath = path.relative(root, path.resolve(root, requested));
  const stats = await port.statRows(root, [relPath]);
  const stat = stats[relPath];
  if (stat === null || stat === undefined) return fileFailureLine('File not found', requested) ?? 'missing';
  return formatFileRow(path.basename(requested), stat);
}
