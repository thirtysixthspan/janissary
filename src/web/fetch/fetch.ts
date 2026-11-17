import type { ProjectTokens } from '../../project/tokens.js';
import { providerApiKey } from '../providers/capabilities.js';
import type { WebFetchRequest, WebSearchCapability } from '../providers/contract.js';
import { webProviderRegistry } from '../providers/default-registry.js';
import { formatFailures, WEB_FETCH_FAILURE_HEADINGS } from '../providers/failure-lines.js';
import type { ProviderFailure } from '../providers/failure-lines.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { WebFetchCommand } from './command.js';
import { renderFetched, renderRedirect } from './render.js';

export type WebFetchDeps = {
  tokens: ProjectTokens;
  fetch: typeof fetch;
  signal?: AbortSignal;
  reportDisabled?: (name: string, reason: string) => void;
  now?: () => number;
};

export function webFetchProviderNames(): string[] {
  return webProviderRegistry.fetchProviderNames();
}

export async function runWebFetch(
  registry: ProviderRegistry,
  request: WebFetchCommand,
  deps: WebFetchDeps,
): Promise<string> {
  deps.signal?.throwIfAborted();
  const resolution = registry.resolveFetchAttempts(request.provider, request.format, deps.tokens);
  if (resolution.kind === 'line') return resolution.line;
  const failures: ProviderFailure[] = [];
  for (const manifest of resolution.manifests) {
    deps.signal?.throwIfAborted();
    const fetchRequest: WebFetchRequest = {
      url: request.url,
      format: request.format,
      timeoutMs: request.timeoutSeconds * 1000,
    };
    const capability: WebSearchCapability = {
      apiKey: providerApiKey(manifest, deps.tokens),
      fetch: deps.fetch,
      signal: deps.signal,
    };
    const outcome = await registry.runFetchAttempt(
      manifest,
      fetchRequest,
      capability,
      deps.reportDisabled,
    );
    if (outcome.kind === 'fetched') {
      deps.signal?.throwIfAborted();
      return renderFetched(
        { url: outcome.url, source: manifest.id, content: outcome.content },
        request.offset,
        request.maxChars,
      );
    }
    if (outcome.kind === 'redirected') {
      deps.signal?.throwIfAborted();
      return renderRedirect(outcome.url);
    }
    if (outcome.kind === 'aborted') throw outcome.error;
    failures.push({ name: manifest.id, reason: outcome.reason });
  }
  deps.signal?.throwIfAborted();
  return formatFailures(failures, WEB_FETCH_FAILURE_HEADINGS);
}

export function webFetch(request: WebFetchCommand, deps: WebFetchDeps): Promise<string> {
  return runWebFetch(webProviderRegistry, request, deps);
}
