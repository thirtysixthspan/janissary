import type { Managers } from '../../managers.js';
import { localReadRoot } from '../../file-read/tab-read.js';
import { withRemoteTabPort } from '../../file-read/remote-tab-port.js';
import { getProjectTokens } from '../../project/tokens.js';
import { reportProviderDisabled } from '../disabled-notice.js';
import { errorText } from '../../error-text.js';
import { parseWebFetch } from './command.js';
import type { WebFetchCommand } from './command.js';
import { webFetch } from './fetch.js';

function fetchRemote(managers: Managers, label: string, parsed: WebFetchCommand): Promise<string> {
  return withRemoteTabPort(managers, label, 'web-fetch', async (port) => {
    try {
      return await port.webFetch(parsed);
    } catch (error) {
      return errorText(error);
    }
  });
}

export async function fetchWebInTab(managers: Managers, label: string, input: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseWebFetch(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return fetchRemote(managers, label, parsed);
  return webFetch(parsed, {
    tokens: getProjectTokens(),
    fetch: globalThis.fetch,
    signal,
    reportDisabled: reportProviderDisabled(managers, label),
  });
}
