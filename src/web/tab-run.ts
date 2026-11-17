import type { Managers } from '../managers.js';
import type { RemoteFileSystemPort } from '../file-navigator/remote/port.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import type { ProjectTokens } from '../project/tokens.js';
import { getProjectTokens } from '../project/tokens.js';
import { reportProviderDisabled } from './disabled-notice.js';
import { errorText } from '../error-text.js';

export type WebTabDeps = {
  tokens: ProjectTokens;
  fetch: typeof fetch;
  signal?: AbortSignal;
  reportDisabled?: (name: string, reason: string) => void;
};

export type WebTabSpec<P extends object> = {
  parse: (input: string) => P | { error: string };
  remoteOperation: string;
  remote: (port: RemoteFileSystemPort, parsed: P) => Promise<string>;
  core: (parsed: P, deps: WebTabDeps) => Promise<string>;
};

export async function runWebSubcommandInTab<P extends object>(
  managers: Managers,
  label: string,
  input: string,
  signal: AbortSignal | undefined,
  spec: WebTabSpec<P>,
): Promise<string> {
  const parsed = spec.parse(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) {
    return withRemoteTabPort(managers, label, spec.remoteOperation, async (port) => {
      try {
        return await spec.remote(port, parsed);
      } catch (error) {
        return errorText(error);
      }
    });
  }
  return spec.core(parsed, {
    tokens: getProjectTokens(),
    fetch: globalThis.fetch,
    signal,
    reportDisabled: reportProviderDisabled(managers, label),
  });
}
