import type { ProjectTokens } from '../../project/tokens.js';
import { fetchesWeb, isConfigured, servesFetchFormat } from './capabilities.js';
import type { WebFetchFormat, WebSearchProviderManifest } from './contract.js';
import { WEB_FETCH_FAILURE_HEADINGS } from './failure-lines.js';
import type { AttemptResolution, DisabledReason } from './resolution.js';
import { resolveDisabledAttempt, resolveEnabledAttempts } from './resolution.js';

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
  return resolveEnabledAttempts(eligible, disabledReason, WEB_FETCH_FAILURE_HEADINGS);
}

function explicitFetchAttempts(
  manifests: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  tokens: ProjectTokens,
  requested: string,
  typedName: string,
  format: WebFetchFormat,
): AttemptResolution {
  const manifest = manifests.find((candidate) => candidate.id === requested);
  if (manifest === undefined) return unknownProvider(manifests, typedName);
  const disabled = resolveDisabledAttempt(manifest, disabledReason, WEB_FETCH_FAILURE_HEADINGS);
  if (disabled !== undefined) return disabled;
  if (!isConfigured(manifest, tokens)) {
    return {
      kind: 'line',
      line: `Web fetch: provider "${manifest.id}" is not configured.`,
    };
  }
  if (!servesFetchFormat(manifest, format)) {
    return {
      kind: 'line',
      line: `Web fetch: provider "${manifest.id}" does not support --format ${format}.`,
    };
  }
  return { kind: 'attempts', manifests: [manifest] };
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
  return explicitFetchAttempts(fetchable, disabledReason, tokens, requested, name, format);
}
