import type { Managers } from '../managers.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { parseFileExists } from './command.js';
import { fileExists } from './exists-core.js';

export function fileExistsInTab(managers: Managers, label: string, input: string): string {
  const parsed = parseFileExists(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
  return fileExists(root, parsed.path);
}
