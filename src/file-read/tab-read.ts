import type { Managers } from '../managers.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { parseFileRead, type FileReadArgs } from './command.js';
import { readWorkspaceLines } from './read.js';
import { REMOTE_UNAVAILABLE, withRemoteTabPort } from './remote-tab-port.js';

export function localReadRoot(managers: Managers, label: string): string | undefined {
  const tab = managers.tab.byLabel(label);
  if (tab?.remote) return undefined;
  return tab?.workspaceDir ?? managers.tab.launchDir;
}

function asTyped(text: string, sent: string, typed: string): string {
  if (sent === typed || text.includes('\n') || text.includes('\t')) return text;
  const suffix = `: ${sent}.`;
  if (!text.endsWith(suffix)) return text;
  return `${text.slice(0, -suffix.length)}: ${typed}.`;
}

function rejectionLine(error: unknown, typed: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === OUTSIDE_ROOT_REASON) return `Outside the workspace: ${typed}.`;
  if (message === REMOTE_UNAVAILABLE) return REMOTE_UNAVAILABLE;
  return message;
}

function readRemoteFile(managers: Managers, label: string, parsed: FileReadArgs): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-read', async (port, workspace) => {
    try {
      const { text, path } = await port.readLines(workspace, parsed.path, parsed.offset, parsed.limit);
      return asTyped(text, path, parsed.path);
    } catch (error) {
      return rejectionLine(error, parsed.path);
    }
  });
}

export async function readFileInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileRead(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return readRemoteFile(managers, label, parsed);
  return readWorkspaceLines(root, parsed);
}
