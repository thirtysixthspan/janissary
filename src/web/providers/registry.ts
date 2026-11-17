import { errorFirstLine } from '../../error-text.js';
import type { ProjectTokens } from '../../project/tokens.js';
import { fetchesWeb, searchesWeb } from './capabilities.js';
import {
  ProviderRequestError,
  WEB_PROVIDER_API_VERSION,
} from './contract.js';
import type {
  WebFetchFormat,
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderManifest,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';
import { resolveFetchAttempts } from './fetch-resolution.js';
import { resolveSearchAttempts } from './search-resolution.js';
import type { AttemptResolution } from './search-resolution.js';

export type AttemptOutcome =
  | { kind: 'results'; results: WebSearchResult[] }
  | { kind: 'failed'; reason: string }
  | { kind: 'aborted'; error: unknown }
  | { kind: 'plugin-failed'; reason: string };

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
};

type ReportDisabled = (name: string, reason: string) => void;

type SearchingProvider = WebSearchProvider & Required<Pick<WebSearchProvider, 'search'>>;

function isSearchingProvider(
  provider: WebSearchProvider | undefined,
): provider is SearchingProvider {
  return typeof provider?.search === 'function';
}

async function loadProvider(
  manifest: WebSearchProviderManifest,
): Promise<SearchingProvider | undefined> {
  const module = await manifest.activate();
  const { provider } = module;
  return isSearchingProvider(provider) ? provider : undefined;
}

export function createProviderRegistry(
  manifests: readonly WebSearchProviderManifest[],
): ProviderRegistry {
  const disabled = new Map<string, string>();

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

  function disable(
    manifest: WebSearchProviderManifest,
    reason: string,
    reportDisabled?: ReportDisabled,
  ): AttemptOutcome {
    if (!disabled.has(manifest.id)) {
      disabled.set(manifest.id, reason);
      reportDisabled?.(manifest.id, reason);
    }
    return { kind: 'plugin-failed', reason };
  }

  function classifyActivationFailure(
    manifest: WebSearchProviderManifest,
    error: unknown,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): AttemptOutcome {
    if (capability.signal?.aborted === true) return { kind: 'aborted', error };
    return disable(manifest, `provider failed: ${errorFirstLine(error)}`, reportDisabled);
  }

  function classifySearchFailure(
    manifest: WebSearchProviderManifest,
    error: unknown,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): AttemptOutcome {
    if (capability.signal?.aborted === true) return { kind: 'aborted', error };
    if (error instanceof ProviderRequestError) return { kind: 'failed', reason: error.message };
    return disable(manifest, `provider failed: ${errorFirstLine(error)}`, reportDisabled);
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

  async function runAttempt(
    manifest: WebSearchProviderManifest,
    request: WebSearchRequest,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): Promise<AttemptOutcome> {
    if (manifest.apiVersion !== WEB_PROVIDER_API_VERSION) {
      return disable(
        manifest,
        `requires provider API ${String(manifest.apiVersion)}`,
        reportDisabled,
      );
    }
    let provider: SearchingProvider | undefined;
    try {
      provider = await loadProvider(manifest);
    } catch (error) {
      return classifyActivationFailure(manifest, error, capability, reportDisabled);
    }
    if (provider === undefined) {
      if (capability.signal?.aborted === true) {
        return { kind: 'aborted', error: capability.signal.reason };
      }
      return disable(manifest, 'provider failed: module has no provider', reportDisabled);
    }
    try {
      const results: WebSearchResult[] = await provider.search(request, capability);
      if (!Array.isArray(results)) {
        if (capability.signal?.aborted === true) {
          return { kind: 'aborted', error: capability.signal.reason };
        }
        return disable(manifest, 'provider failed: search did not return an array', reportDisabled);
      }
      return { kind: 'results', results };
    } catch (error) {
      return classifySearchFailure(manifest, error, capability, reportDisabled);
    }
  }

  return {
    searchProviderNames,
    resolveAttempts,
    resolveFetchAttempts: resolveFetch,
    fetchProviderNames,
    runAttempt,
  };
}
