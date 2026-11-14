import type { Managers } from '../managers.js';
import { asTyped, localReadRoot, rejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileGlob, type FileGlobArgs } from './command.js';
import { GLOB_TIMEOUT_MS, globWorkspace } from './glob.js';

function globRemotePaths(managers: Managers, label: string, args: FileGlobArgs): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-glob', async (port, workspace) => {
    try {
      const { text, dir } = await port.globPaths(workspace, args);
      if (dir === undefined || args.dir === undefined) return text;
      return asTyped(text, dir, args.dir);
    } catch (error) {
      return rejectionLine(error, args.dir ?? '.');
    }
  });
}

export async function globFilesInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseFileGlob(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return globRemotePaths(managers, label, parsed);
  return globWorkspace(root, parsed, Date.now() + GLOB_TIMEOUT_MS, signal);
}
