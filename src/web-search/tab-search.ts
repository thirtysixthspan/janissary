import type { Managers } from '../managers.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { getProjectTokens } from '../project/tokens.js';
import { notify } from '../notifications/index.js';
import { errorText } from '../error-text.js';
import { parseWebSearch } from './command.js';
import type { WebSearchCommand } from './command.js';
import { webSearch } from './search.js';

function searchRemote(managers: Managers, label: string, parsed: WebSearchCommand): Promise<string> {
  return withRemoteTabPort(managers, label, 'web-search', async (port) => {
    try {
      return await port.webSearch(parsed);
    } catch (error) {
      return errorText(error);
    }
  });
}

export async function searchWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseWebSearch(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return searchRemote(managers, label, parsed);
  return webSearch(parsed, {
    tokens: getProjectTokens(),
    fetch: globalThis.fetch,
    signal,
    reportDisabled: (name, reason) => {
      notify(managers, 'plugin-failure', label, `Web search provider "${name}" disabled: ${reason}.`);
    },
  });
}
