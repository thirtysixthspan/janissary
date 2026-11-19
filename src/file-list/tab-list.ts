import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { parseFileList } from './command.js';
import { listFiles } from './list-core.js';

export async function listFilesInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileList(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  return listFiles(root, parsed.path, port);
}
