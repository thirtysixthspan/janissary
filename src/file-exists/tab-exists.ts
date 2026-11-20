import type { Managers } from '../managers.js';
import { localReadRoot, oneWordRejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileExists } from './command.js';
import { fileExists } from './exists-core.js';

function existsRemoteFile(managers: Managers, label: string, relPath: string): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-exists', async (port, workspace) => {
    try {
      const { text } = await port.pathExists(workspace, relPath);
      return text;
    } catch (error) {
      return oneWordRejectionLine(error, relPath);
    }
  });
}

export function fileExistsInTab(managers: Managers, label: string, input: string): string | Promise<string> {
  const parsed = parseFileExists(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return existsRemoteFile(managers, label, parsed.path);
  return fileExists(root, parsed.path);
}
