import type { Managers } from '../../managers.js';
import { parseWebSearch, type WebSearchCommand } from './command.js';
import { webSearch } from './search.js';
import { runWebSubcommandInTab } from '../tab-run.js';

export async function searchWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  return runWebSubcommandInTab<WebSearchCommand>(managers, label, input, signal, {
    parse: parseWebSearch,
    remoteOperation: 'web-search',
    remote: (port, parsed) => port.webSearch(parsed),
    core: webSearch,
  });
}
