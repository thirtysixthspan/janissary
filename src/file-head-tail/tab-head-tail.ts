import type { Managers } from '../managers.js';
import { localReadRoot, rejectionLine } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { parseFileHeadTail, type HeadTailArgs } from './command.js';
import { headTail } from './head-tail-core.js';

function headTailRemote(managers: Managers, label: string, parsed: HeadTailArgs): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-head-tail', async (port, workspace) => {
    try {
      const result = parsed.direction === 'head'
        ? await port.headLines(workspace, parsed.path, parsed.count)
        : await port.tailLines(workspace, parsed.path, parsed.count);
      return result.text;
    } catch (error) {
      return rejectionLine(error, parsed.path);
    }
  });
}

export function headTailInTab(managers: Managers, label: string, input: string): string | Promise<string> {
  const parsed = parseFileHeadTail(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return headTailRemote(managers, label, parsed);
  return headTail(root, parsed);
}
