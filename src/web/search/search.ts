import type { ProjectTokens } from '../../project/tokens.js';
import type { WebSearchCommand } from './command.js';
import type { WebSearchCapability, WebSearchRequest, WebSearchResult } from '../providers/contract.js';
import { providerApiKey } from '../providers/capabilities.js';
import { formatFailures, WEB_SEARCH_FAILURE_HEADINGS } from '../providers/failure-lines.js';
import type { ProviderFailure } from '../providers/failure-lines.js';
import { webSearchProviderCatalog } from '../providers/catalog.js';
import { createProviderRegistry } from '../providers/registry.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { dedupeResults, normalizeResults, renderResults } from './render.js';

export type WebSearchDeps = {
  tokens: ProjectTokens;
  fetch: typeof fetch;
  signal?: AbortSignal;
  reportDisabled?: (name: string, reason: string) => void;
};

const providerRegistry = createProviderRegistry(webSearchProviderCatalog);

export function webSearchProviderNames(): string[] {
  return providerRegistry.searchProviderNames();
}

function renderSearch(results: WebSearchResult[], request: WebSearchCommand): string {
  const cut = dedupeResults(normalizeResults(results)).slice(0, request.numResults);
  return cut.length === 0
    ? `No results for "${request.query}".`
    : renderResults(cut, cut.length, request.maxChars);
}

export async function runWebSearch(
  registry: ProviderRegistry,
  request: WebSearchCommand,
  deps: WebSearchDeps,
): Promise<string> {
  deps.signal?.throwIfAborted();
  const resolution = registry.resolveAttempts(request.provider, deps.tokens);
  if (resolution.kind === 'line') return resolution.line;
  const failures: ProviderFailure[] = [];
  for (const manifest of resolution.manifests) {
    deps.signal?.throwIfAborted();
    const providerRequest: WebSearchRequest = {
      query: request.query,
      numResults: request.numResults,
      depth: request.depth,
    };
    const capability: WebSearchCapability = {
      apiKey: providerApiKey(manifest, deps.tokens),
      fetch: deps.fetch,
      signal: deps.signal,
    };
    const outcome = await registry.runAttempt(
      manifest,
      providerRequest,
      capability,
      deps.reportDisabled,
    );
    if (outcome.kind === 'results') {
      deps.signal?.throwIfAborted();
      return renderSearch(outcome.results, request);
    }
    if (outcome.kind === 'aborted') throw outcome.error;
    failures.push({ name: manifest.id, reason: outcome.reason });
  }
  deps.signal?.throwIfAborted();
  return formatFailures(failures, WEB_SEARCH_FAILURE_HEADINGS);
}

export function webSearch(request: WebSearchCommand, deps: WebSearchDeps): Promise<string> {
  return runWebSearch(providerRegistry, request, deps);
}
