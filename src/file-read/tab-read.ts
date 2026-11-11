import type { Managers } from '../managers.js';
import { parseFileRead } from './command.js';
import { readWorkspaceLines } from './read.js';

const REMOTE_UNAVAILABLE = 'Remote connection unavailable.';

export async function readFileInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileRead(input);
  if ('error' in parsed) return parsed.error;
  const tab = managers.tab.byLabel(label);
  if (tab?.remote) return REMOTE_UNAVAILABLE;
  return readWorkspaceLines(tab?.workspaceDir ?? managers.tab.launchDir, parsed);
}
