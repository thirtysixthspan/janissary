import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { localReadRoot, oneWordRejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileList } from './command.js';
import { listFiles } from './list-core.js';

function listRemoteFiles(managers: Managers, label: string, relPath: string): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-list', async (port, workspace) => {
    try {
      const { text } = await port.listDirectory(workspace, relPath);
      return text;
    } catch (error) {
      return oneWordRejectionLine(error, relPath);
    }
  });
}

export async function listFilesInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileList(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return listRemoteFiles(managers, label, parsed.path);
  return listFiles(root, parsed.path, port);
}
