import type { ProjectTokens } from '../../project/tokens.js';
import { isConfigured, searchesWeb } from './capabilities.js';
import type { WebSearchProviderManifest } from './contract.js';
import { formatFailures, WEB_SEARCH_FAILURE_HEADINGS } from './failure-lines.js';

export type AttemptResolution =
  | { kind: 'attempts'; manifests: WebSearchProviderManifest[] }
  | { kind: 'line'; line: string };

export type DisabledReason = (id: string) => string | undefined;

function explicitAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  requested: string,
  typedName: string,
  tokens: ProjectTokens,
): AttemptResolution {
  const manifest = manifests.find((candidate) => candidate.id === requested);
  if (manifest === undefined) {
    const available = ['auto', ...manifests.map((candidate) => candidate.id)].join(', ');
    return {
      kind: 'line',
      line: `Web search: unknown provider "${typedName}" (available: ${available}).`,
    };
  }
  const reason = disabledReason(manifest.id);
  if (reason !== undefined) {
    return {
      kind: 'line',
      line: formatFailures([{ name: manifest.id, reason }], WEB_SEARCH_FAILURE_HEADINGS),
    };
  }
  if (!isConfigured(manifest, tokens)) {
    return {
      kind: 'line',
      line: `Web search: provider "${manifest.id}" is not configured.`,
    };
  }
  return { kind: 'attempts', manifests: [manifest] };
}

function autoAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  tokens: ProjectTokens,
): AttemptResolution {
  const configuredManifests = manifests.filter((manifest) => isConfigured(manifest, tokens));
  if (configuredManifests.length === 0) {
    return { kind: 'line', line: 'Web search: no provider configured.' };
  }
  const enabled = configuredManifests.filter(
    (manifest) => disabledReason(manifest.id) === undefined,
  );
  if (enabled.length > 0) return { kind: 'attempts', manifests: enabled };
  const failures = configuredManifests.map((manifest) => ({
    name: manifest.id,
    reason: disabledReason(manifest.id) ?? 'Unknown failure',
  }));
  return { kind: 'line', line: formatFailures(failures, WEB_SEARCH_FAILURE_HEADINGS) };
}

export function resolveSearchAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  tokens: ProjectTokens,
  name: string,
): AttemptResolution {
  const searchable = manifests.filter((manifest) => searchesWeb(manifest));
  const requested = name.toLowerCase();
  if (requested === 'auto') return autoAttempts(searchable, disabledReason, tokens);
  return explicitAttempts(searchable, disabledReason, requested, name, tokens);
}
