import type { Managers } from '../managers.js';
import { asTyped, localReadRoot, rejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileGrep, type FileGrepArgs } from './command.js';
import { grepWorkspace } from './grep.js';
import { GREP_TIMEOUT_MS } from './scan.js';

function grepRemoteFiles(managers: Managers, label: string, args: FileGrepArgs): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-grep', async (port, workspace) => {
    try {
      const { text, path } = await port.grepFiles(workspace, args);
      if (path === undefined || args.path === undefined) return text;
      if (text !== `Path not found: ${path}.` && text !== `Outside the workspace: ${path}.`) return text;
      return asTyped(text, path, args.path);
    } catch (error) {
      return rejectionLine(error, args.path ?? '.');
    }
  });
}

export async function grepFilesInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileGrep(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return grepRemoteFiles(managers, label, parsed);
  return grepWorkspace(root, parsed, Date.now() + GREP_TIMEOUT_MS);
}
