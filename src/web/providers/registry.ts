import { errorFirstLine } from '../../error-text.js';
import type { ProjectTokens } from '../../project/tokens.js';
import { isConfigured } from './capabilities.js';
import {
  ProviderRequestError,
  WEB_PROVIDER_API_VERSION,
} from './contract.js';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderManifest,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';
import { formatFailures } from './failure-lines.js';

export type AttemptResolution =
  | { kind: 'attempts'; manifests: WebSearchProviderManifest[] }
  | { kind: 'line'; line: string };

export type AttemptOutcome =
  | { kind: 'results'; results: WebSearchResult[] }
  | { kind: 'failed'; reason: string }
  | { kind: 'aborted'; error: unknown }
  | { kind: 'plugin-failed'; reason: string };

export type ProviderRegistry = {
  providerNames: () => string[];
  resolveAttempts: (name: string, tokens: ProjectTokens) => AttemptResolution;
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

  function providerNames(): string[] {
    return manifests.map((manifest) => manifest.id);
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

  function explicitAttempts(
    requested: string,
    typedName: string,
    tokens: ProjectTokens,
  ): AttemptResolution {
    const manifest = manifests.find((candidate) => candidate.id === requested);
    if (manifest === undefined) {
      const available = ['auto', ...providerNames()].join(', ');
      return {
        kind: 'line',
        line: `Web search: unknown provider "${typedName}" (available: ${available}).`,
      };
    }
    const reason = disabled.get(manifest.id);
    if (reason !== undefined) {
      return { kind: 'line', line: formatFailures([{ name: manifest.id, reason }]) };
    }
    if (!isConfigured(manifest, tokens)) {
      return {
        kind: 'line',
        line: `Web search: provider "${manifest.id}" is not configured.`,
      };
    }
    return { kind: 'attempts', manifests: [manifest] };
  }

  function autoAttempts(tokens: ProjectTokens): AttemptResolution {
    const configuredManifests = manifests.filter((manifest) => isConfigured(manifest, tokens));
    if (configuredManifests.length === 0) {
      return { kind: 'line', line: 'Web search: no provider configured.' };
    }
    const enabled = configuredManifests.filter((manifest) => !disabled.has(manifest.id));
    if (enabled.length > 0) return { kind: 'attempts', manifests: enabled };
    const failures = configuredManifests.map((manifest) => ({
      name: manifest.id,
      reason: disabled.get(manifest.id) ?? 'Unknown failure',
    }));
    return { kind: 'line', line: formatFailures(failures) };
  }

  function resolveAttempts(name: string, tokens: ProjectTokens): AttemptResolution {
    const requested = name.toLowerCase();
    if (requested === 'auto') return autoAttempts(tokens);
    return explicitAttempts(requested, name, tokens);
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

  return { providerNames, resolveAttempts, runAttempt };
}
