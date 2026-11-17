import type { Managers } from '../managers.js';
import { WEB_USAGE, webSubcommand } from './command-line.js';
import { fetchWebInTab } from './fetch/tab-fetch.js';
import { searchWebInTab } from './search/tab-search.js';

export async function runWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  const subcommand = webSubcommand(input);
  if (subcommand === 'search') return searchWebInTab(managers, label, input, signal);
  if (subcommand === 'fetch') return fetchWebInTab(managers, label, input, signal);
  return WEB_USAGE;
}
