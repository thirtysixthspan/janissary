import type { ProjectTokens } from '../../project/tokens.js';
import { createAttemptGuards } from './attempt-guards.js';
import type { AttemptFailure, ReportDisabled } from './attempt-guards.js';
import { fetchesWeb, searchesWeb } from './capabilities.js';
import { WEB_PROVIDER_API_VERSION } from './contract.js';
import type {
  WebFetchFormat,
  WebFetchRequest,
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderManifest,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';
import { decodeFetchResult } from './fetch-result.js';
import type { FetchAnswer } from './fetch-result.js';
import { resolveFetchAttempts } from './fetch-resolution.js';
import { resolveSearchAttempts } from './search-resolution.js';
import type { AttemptResolution } from './search-resolution.js';

export type AttemptOutcome =
  | AttemptFailure
  | { kind: 'results'; results: WebSearchResult[] };

export type FetchAttemptOutcome = FetchAnswer | AttemptFailure;

export type ProviderRegistry = {
  searchProviderNames: () => string[];
  resolveAttempts: (name: string, tokens: ProjectTokens) => AttemptResolution;
  fetchProviderNames: () => string[];
  resolveFetchAttempts: (
    name: string,
    format: WebFetchFormat,
    tokens: ProjectTokens,
  ) => AttemptResolution;
  runAttempt: (
    manifest: WebSearchProviderManifest,
    request: WebSearchRequest,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ) => Promise<AttemptOutcome>;
  runFetchAttempt: (
    manifest: WebSearchProviderManifest,
    request: WebFetchRequest,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ) => Promise<FetchAttemptOutcome>;
};

type ProviderOperation = 'search' | 'fetch';

type SearchingProvider = WebSearchProvider & Required<Pick<WebSearchProvider, 'search'>>;

type FetchingProvider = WebSearchProvider & Required<Pick<WebSearchProvider, 'fetch'>>;

type ProviderForOperation = {
  search: SearchingProvider;
  fetch: FetchingProvider;
};

type Loaded<Operation extends ProviderOperation> =
  | AttemptFailure
  | { kind: 'loaded'; provider: ProviderForOperation[Operation] };

const MISSING_FUNCTION_REASONS: Record<ProviderOperation, string> = {
  search: 'provider failed: module has no provider',
  fetch: 'provider failed: module has no fetch',
};

function hasOperation<Operation extends ProviderOperation>(
  provider: WebSearchProvider | undefined,
  operation: Operation,
): provider is ProviderForOperation[Operation] {
  return typeof provider?.[operation] === 'function';
}

async function loadProvider<Operation extends ProviderOperation>(
  manifest: WebSearchProviderManifest,
  operation: Operation,
): Promise<ProviderForOperation[Operation] | undefined> {
  const module = await manifest.activate();
  const { provider } = module;
  return hasOperation(provider, operation) ? provider : undefined;
}

export function createProviderRegistry(
  manifests: readonly WebSearchProviderManifest[],
): ProviderRegistry {
  const disabled = new Map<string, string>();
  const guards = createAttemptGuards(disabled);

  function searchProviderNames(): string[] {
    return manifests
      .filter((manifest) => searchesWeb(manifest))
      .map((manifest) => manifest.id);
  }

  function fetchProviderNames(): string[] {
    return manifests
      .filter((manifest) => fetchesWeb(manifest))
      .map((manifest) => manifest.id);
  }

  function resolveAttempts(name: string, tokens: ProjectTokens): AttemptResolution {
    return resolveSearchAttempts(manifests, (id) => disabled.get(id), tokens, name);
  }

  function resolveFetch(
    name: string,
    format: WebFetchFormat,
    tokens: ProjectTokens,
  ): AttemptResolution {
    return resolveFetchAttempts(manifests, (id) => disabled.get(id), tokens, name, format);
  }

  async function activateProvider<Operation extends ProviderOperation>(
    manifest: WebSearchProviderManifest,
    operation: Operation,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): Promise<Loaded<Operation>> {
    if (manifest.apiVersion !== WEB_PROVIDER_API_VERSION) {
      return guards.disable(
        manifest,
        `requires provider API ${String(manifest.apiVersion)}`,
        reportDisabled,
      );
    }
    let provider: ProviderForOperation[Operation] | undefined;
    try {
      provider = await loadProvider(manifest, operation);
    } catch (error) {
      return guards.classifyActivationFailure(manifest, error, capability, reportDisabled);
    }
    if (provider === undefined) {
      if (capability.signal?.aborted === true) {
        return { kind: 'aborted', error: capability.signal.reason };
      }
      return guards.disable(manifest, MISSING_FUNCTION_REASONS[operation], reportDisabled);
    }
    return { kind: 'loaded', provider };
  }

  async function runAttempt(
    manifest: WebSearchProviderManifest,
    request: WebSearchRequest,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): Promise<AttemptOutcome> {
    const activated = await activateProvider(manifest, 'search', capability, reportDisabled);
    if (activated.kind !== 'loaded') return activated;
    const { provider } = activated;
    try {
      const results: WebSearchResult[] = await provider.search(request, capability);
      if (!Array.isArray(results)) {
        if (capability.signal?.aborted === true) {
          return { kind: 'aborted', error: capability.signal.reason };
        }
        return guards.disable(manifest, 'provider failed: search did not return an array', reportDisabled);
      }
      return { kind: 'results', results };
    } catch (error) {
      return guards.classifyCallFailure(manifest, error, capability, reportDisabled);
    }
  }

  async function runFetchAttempt(
    manifest: WebSearchProviderManifest,
    request: WebFetchRequest,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): Promise<FetchAttemptOutcome> {
    const activated = await activateProvider(manifest, 'fetch', capability, reportDisabled);
    if (activated.kind !== 'loaded') return activated;
    const { provider } = activated;
    try {
      const answer = decodeFetchResult(await provider.fetch(request, capability));
      if (answer === undefined) {
        if (capability.signal?.aborted === true) {
          return { kind: 'aborted', error: capability.signal.reason };
        }
        return guards.disable(manifest, 'provider failed: fetch did not return a page', reportDisabled);
      }
      return answer;
    } catch (error) {
      return guards.classifyCallFailure(manifest, error, capability, reportDisabled);
    }
  }

  return {
    searchProviderNames,
    resolveAttempts,
    resolveFetchAttempts: resolveFetch,
    fetchProviderNames,
    runAttempt,
    runFetchAttempt,
  };
}
