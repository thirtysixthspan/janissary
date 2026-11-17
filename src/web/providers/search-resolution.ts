import type { ProjectTokens } from '../../project/tokens.js';
import { isConfigured, searchesWeb } from './capabilities.js';
import type { WebSearchProviderManifest } from './contract.js';
import { WEB_SEARCH_FAILURE_HEADINGS } from './failure-lines.js';
import type { AttemptResolution, DisabledReason } from './resolution.js';
import { resolveDisabledAttempt, resolveEnabledAttempts } from './resolution.js';

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
  const disabled = resolveDisabledAttempt(manifest, disabledReason, WEB_SEARCH_FAILURE_HEADINGS);
  if (disabled !== undefined) return disabled;
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
  return resolveEnabledAttempts(configuredManifests, disabledReason, WEB_SEARCH_FAILURE_HEADINGS);
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
