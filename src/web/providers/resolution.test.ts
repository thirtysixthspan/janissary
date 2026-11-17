import { describe, expect, it, vi } from 'vitest';
import { WEB_PROVIDER_API_VERSION } from './contract.js';
import type { WebSearchProviderManifest, WebSearchProviderModule } from './contract.js';
import { WEB_FETCH_FAILURE_HEADINGS, WEB_SEARCH_FAILURE_HEADINGS } from './failure-lines.js';
import { resolveDisabledAttempt, resolveEnabledAttempts } from './resolution.js';
import type { AttemptResolution, DisabledReason } from './resolution.js';

function manifest(id: string): WebSearchProviderManifest {
  return {
    id,
    apiVersion: WEB_PROVIDER_API_VERSION,
    activate: vi.fn(async (): Promise<WebSearchProviderModule> => ({ provider: {} })),
  };
}

function disabledReason(entries: readonly (readonly [string, string])[] = []): DisabledReason {
  const map = new Map(entries);
  return (id) => map.get(id);
}

function ids(resolution: AttemptResolution): string[] {
  if (resolution.kind !== 'attempts') throw new Error('expected attempts');
  return resolution.manifests.map((candidate) => candidate.id);
}

function line(resolution: AttemptResolution): string {
  if (resolution.kind !== 'line') throw new Error('expected a line');
  return resolution.line;
}

function disabledLine(resolution: AttemptResolution | undefined): string {
  if (resolution === undefined || resolution.kind !== 'line') {
    throw new Error('expected a disabled line');
  }
  return resolution.line;
}

describe('resolveEnabledAttempts', () => {
  it('returns the enabled manifests in order, skipping disabled ones', () => {
    const eligible = [manifest('tavily'), manifest('tinyfish'), manifest('local')];
    const disabled = disabledReason([['tinyfish', 'provider failed: boom']]);

    expect(ids(resolveEnabledAttempts(eligible, disabled, WEB_SEARCH_FAILURE_HEADINGS)))
      .toEqual(['tavily', 'local']);
  });

  it('returns a single failure line when the only eligible manifest is disabled', () => {
    const eligible = [manifest('tavily')];
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(line(resolveEnabledAttempts(eligible, disabled, WEB_SEARCH_FAILURE_HEADINGS)))
      .toBe('Web search failed (tavily): provider failed: boom.');
  });

  it('returns the every-failed block in catalog order when all are disabled', () => {
    const eligible = [manifest('tavily'), manifest('tinyfish')];
    const disabled = disabledReason([
      ['tavily', 'provider failed: tavily boom'],
      ['tinyfish', 'provider failed: tinyfish boom'],
    ]);

    expect(line(resolveEnabledAttempts(eligible, disabled, WEB_SEARCH_FAILURE_HEADINGS))).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: tavily boom',
      '- tinyfish: provider failed: tinyfish boom',
    ].join('\n'));
  });

  it('uses the caller headings for the failure line', () => {
    const eligible = [manifest('tavily')];
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(line(resolveEnabledAttempts(eligible, disabled, WEB_FETCH_FAILURE_HEADINGS)))
      .toBe('Web fetch failed (tavily): provider failed: boom.');
  });
});

describe('resolveDisabledAttempt', () => {
  it('returns undefined when the manifest has no stored reason', () => {
    expect(resolveDisabledAttempt(manifest('tavily'), disabledReason(), WEB_SEARCH_FAILURE_HEADINGS))
      .toBeUndefined();
  });

  it('returns the single failure line with the caller headings when disabled', () => {
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(disabledLine(resolveDisabledAttempt(manifest('tavily'), disabled, WEB_SEARCH_FAILURE_HEADINGS)))
      .toBe('Web search failed (tavily): provider failed: boom.');
    expect(disabledLine(resolveDisabledAttempt(manifest('tavily'), disabled, WEB_FETCH_FAILURE_HEADINGS)))
      .toBe('Web fetch failed (tavily): provider failed: boom.');
  });
});
