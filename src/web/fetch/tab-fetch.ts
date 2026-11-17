import type { Managers } from '../../managers.js';
import { parseWebFetch, type WebFetchCommand } from './command.js';
import { webFetch } from './fetch.js';
import { runWebSubcommandInTab } from '../tab-run.js';

export async function fetchWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  return runWebSubcommandInTab<WebFetchCommand>(managers, label, input, signal, {
    parse: parseWebFetch,
    remoteOperation: 'web-fetch',
    remote: (port, parsed) => port.webFetch(parsed),
    core: webFetch,
  });
}
