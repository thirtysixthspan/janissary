import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { parseFileStat } from './command.js';
import { statFile } from './stat-core.js';

export async function statFileInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileStat(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  return statFile(root, parsed.path, port);
}
