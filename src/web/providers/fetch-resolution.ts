import type { ProjectTokens } from '../../project/tokens.js';
import { fetchesWeb, isConfigured, servesFetchFormat } from './capabilities.js';
import type { WebFetchFormat, WebSearchProviderManifest } from './contract.js';
import { formatFailures, WEB_FETCH_FAILURE_HEADINGS } from './failure-lines.js';
import type { AttemptResolution, DisabledReason } from './search-resolution.js';

function unknownProvider(
  manifests: readonly WebSearchProviderManifest[],
  typedName: string,
): AttemptResolution {
  const available = ['auto', ...manifests.map((manifest) => manifest.id)].join(', ');
  return {
    kind: 'line',
    line: `Web fetch: unknown provider "${typedName}" (available: ${available}).`,
  };
}

function autoFetchAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  tokens: ProjectTokens,
  format: WebFetchFormat,
): AttemptResolution {
  const eligible = manifests.filter(
    (manifest) => isConfigured(manifest, tokens) && servesFetchFormat(manifest, format),
  );
  if (eligible.length === 0) {
    return { kind: 'line', line: 'Web fetch: no provider configured.' };
  }
  const enabled = eligible.filter((manifest) => disabledReason(manifest.id) === undefined);
  if (enabled.length > 0) return { kind: 'attempts', manifests: enabled };
  const failures = eligible.map((manifest) => ({
    name: manifest.id,
    reason: disabledReason(manifest.id) ?? 'Unknown failure',
  }));
  return { kind: 'line', line: formatFailures(failures, WEB_FETCH_FAILURE_HEADINGS) };
}

export function resolveFetchAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  tokens: ProjectTokens,
  name: string,
  format: WebFetchFormat,
): AttemptResolution {
  const fetchable = manifests.filter((manifest) => fetchesWeb(manifest));
  const requested = name.toLowerCase();
  if (requested === 'auto') return autoFetchAttempts(fetchable, disabledReason, tokens, format);
  return unknownProvider(fetchable, name);
}
