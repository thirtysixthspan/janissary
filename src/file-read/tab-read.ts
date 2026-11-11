import type { Managers } from '../managers.js';
import { parseFileRead } from './command.js';
import { readWorkspaceLines } from './read.js';

const REMOTE_UNAVAILABLE = 'Remote connection unavailable.';

export function localReadRoot(managers: Managers, label: string): string | undefined {
  const tab = managers.tab.byLabel(label);
  if (tab?.remote) return undefined;
  return tab?.workspaceDir ?? managers.tab.launchDir;
}

export async function readFileInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileRead(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return REMOTE_UNAVAILABLE;
  return readWorkspaceLines(root, parsed);
}
