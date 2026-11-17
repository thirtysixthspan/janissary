import type { WebSearchProviderManifest } from './contract.js';
import type { FailureHeadings } from './failure-lines.js';
import { formatFailures } from './failure-lines.js';

export type AttemptResolution =
  | { kind: 'attempts'; manifests: WebSearchProviderManifest[] }
  | { kind: 'line'; line: string };

export type DisabledReason = (id: string) => string | undefined;

export function resolveEnabledAttempts(
  eligible: readonly WebSearchProviderManifest[],
  disabledReason: DisabledReason,
  headings: FailureHeadings,
): AttemptResolution {
  const enabled = eligible.filter((manifest) => disabledReason(manifest.id) === undefined);
  if (enabled.length > 0) return { kind: 'attempts', manifests: enabled };
  const failures = eligible.map((manifest) => ({
    name: manifest.id,
    reason: disabledReason(manifest.id) ?? 'Unknown failure',
  }));
  return { kind: 'line', line: formatFailures(failures, headings) };
}

export function resolveDisabledAttempt(
  manifest: WebSearchProviderManifest,
  disabledReason: DisabledReason,
  headings: FailureHeadings,
): AttemptResolution | undefined {
  const reason = disabledReason(manifest.id);
  if (reason === undefined) return undefined;
  return { kind: 'line', line: formatFailures([{ name: manifest.id, reason }], headings) };
}
