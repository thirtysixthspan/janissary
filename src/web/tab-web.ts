import type { Managers } from '../managers.js';
import { WEB_USAGE, webSubcommand } from './command-line.js';
import { searchWebInTab } from './search/tab-search.js';

export async function runWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  if (webSubcommand(input) === 'search') return searchWebInTab(managers, label, input, signal);
  return WEB_USAGE;
}
