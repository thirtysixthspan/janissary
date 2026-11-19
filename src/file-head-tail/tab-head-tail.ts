import type { Managers } from '../managers.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { parseFileHeadTail } from './command.js';
import { headTail } from './head-tail-core.js';

export function headTailInTab(managers: Managers, label: string, input: string): string {
  const parsed = parseFileHeadTail(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  return headTail(root, parsed);
}
