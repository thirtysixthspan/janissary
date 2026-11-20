import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { localReadRoot, oneWordRejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileStat } from './command.js';
import { statFile } from './stat-core.js';

function statRemoteFile(managers: Managers, label: string, relPath: string): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-stat', async (port, workspace) => {
    try {
      const { text } = await port.statPath(workspace, relPath);
      return text;
    } catch (error) {
      return oneWordRejectionLine(error, relPath);
    }
  });
}

export async function statFileInTab(
  managers: Managers, label: string, input: string, port: FileSystemPort = new LocalFileSystemPort(),
): Promise<string> {
  const parsed = parseFileStat(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return statRemoteFile(managers, label, parsed.path);
  return statFile(root, parsed.path, port);
}
