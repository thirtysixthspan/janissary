import { errorFirstLine } from '../../error-text.js';
import { ProviderRequestError } from './contract.js';
import type { WebSearchCapability, WebSearchProviderManifest } from './contract.js';

export type ReportDisabled = (name: string, reason: string) => void;

export type AttemptFailure =
  | { kind: 'failed'; reason: string }
  | { kind: 'aborted'; error: unknown }
  | { kind: 'plugin-failed'; reason: string };

export type AttemptGuards = {
  disable: (
    manifest: WebSearchProviderManifest,
    reason: string,
    reportDisabled?: ReportDisabled,
  ) => AttemptFailure;
  classifyActivationFailure: (
    manifest: WebSearchProviderManifest,
    error: unknown,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ) => AttemptFailure;
  classifyCallFailure: (
    manifest: WebSearchProviderManifest,
    error: unknown,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ) => AttemptFailure;
};

export function createAttemptGuards(disabled: Map<string, string>): AttemptGuards {
  function disable(
    manifest: WebSearchProviderManifest,
    reason: string,
    reportDisabled?: ReportDisabled,
  ): AttemptFailure {
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
  ): AttemptFailure {
    if (capability.signal?.aborted === true) return { kind: 'aborted', error };
    return disable(manifest, `provider failed: ${errorFirstLine(error)}`, reportDisabled);
  }

  function classifyCallFailure(
    manifest: WebSearchProviderManifest,
    error: unknown,
    capability: WebSearchCapability,
    reportDisabled?: ReportDisabled,
  ): AttemptFailure {
    if (capability.signal?.aborted === true) return { kind: 'aborted', error };
    if (error instanceof ProviderRequestError) return { kind: 'failed', reason: error.message };
    return disable(manifest, `provider failed: ${errorFirstLine(error)}`, reportDisabled);
  }

  return { disable, classifyActivationFailure, classifyCallFailure };
}
