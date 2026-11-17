import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ProjectTokenName, ProjectTokens } from '../../project/tokens.js';
import { WEB_PROVIDER_API_VERSION } from './contract.js';
import type { WebSearchProviderManifest, WebSearchProviderModule } from './contract.js';
import { resolveSearchAttempts } from './search-resolution.js';
import type { AttemptResolution, DisabledReason } from './resolution.js';

const TOKENS: ProjectTokens = { tavily: 'tavily-key', tinyfish: 'tinyfish-key' };

type FakeManifestOptions = {
  token?: ProjectTokenName | null;
  search?: boolean;
};

type FakeManifest = WebSearchProviderManifest & {
  activate: Mock<() => Promise<WebSearchProviderModule>>;
};

function fakeManifest(id: string, options: FakeManifestOptions = {}): FakeManifest {
  const token = options.token === null ? undefined : (options.token ?? (id as ProjectTokenName));
  return {
    id,
    apiVersion: WEB_PROVIDER_API_VERSION,
    ...(token !== undefined && { token }),
    ...(options.search !== undefined && { search: options.search }),
    activate: vi.fn(async () => ({ provider: {} })),
  };
}

function disabledReason(
  entries: readonly (readonly [string, string])[] = [],
): DisabledReason {
  const map = new Map(entries);
  return (id) => map.get(id);
}

function ids(resolution: AttemptResolution): string[] {
  if (resolution.kind !== 'attempts') throw new Error('expected attempts');
  return resolution.manifests.map((manifest) => manifest.id);
}

function line(resolution: AttemptResolution): string {
  if (resolution.kind !== 'line') throw new Error('expected a line');
  return resolution.line;
}

describe('resolveSearchAttempts', () => {
  it('lists configured providers in catalog order for auto, skipping a missing or empty token', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];
    const resolve = (tokens: ProjectTokens) =>
      resolveSearchAttempts(manifests, disabledReason(), tokens, 'auto');

    expect(ids(resolve(TOKENS))).toEqual(['tavily', 'tinyfish']);
    expect(ids(resolve({ tavily: 'key' }))).toEqual(['tavily']);
    expect(ids(resolve({ tavily: '', tinyfish: 'key' }))).toEqual(['tinyfish']);
  });

  it('treats AUTO and Auto as auto and reports no provider when none is configured', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];
    const none = disabledReason();

    expect(ids(resolveSearchAttempts(manifests, none, TOKENS, 'AUTO')))
      .toEqual(['tavily', 'tinyfish']);
    expect(line(resolveSearchAttempts(manifests, none, {}, 'auto')))
      .toBe('Web search: no provider configured.');
    expect(line(resolveSearchAttempts(manifests, none, {}, 'Auto')))
      .toBe('Web search: no provider configured.');
  });

  it('matches an explicit provider name case-insensitively', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];

    expect(ids(resolveSearchAttempts(manifests, disabledReason(), TOKENS, 'Tavily')))
      .toEqual(['tavily']);
  });

  it('reports an unknown provider with the name as typed', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];

    expect(line(resolveSearchAttempts(manifests, disabledReason(), TOKENS, 'Bing')))
      .toBe('Web search: unknown provider "Bing" (available: auto, tavily, tinyfish).');
  });

  it('reports a known but unconfigured provider by its manifest id', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];

    expect(line(resolveSearchAttempts(manifests, disabledReason(), { tavily: 'key' }, 'TinyFish')))
      .toBe('Web search: provider "tinyfish" is not configured.');
  });

  it('prints the stored failure for an explicit disabled provider, even without its token', () => {
    const manifests = [fakeManifest('tavily')];
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(line(resolveSearchAttempts(manifests, disabled, TOKENS, 'tavily')))
      .toBe('Web search failed (tavily): provider failed: boom.');
    expect(line(resolveSearchAttempts(manifests, disabled, {}, 'tavily')))
      .toBe('Web search failed (tavily): provider failed: boom.');
  });

  it('skips a disabled provider in auto', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(ids(resolveSearchAttempts(manifests, disabled, TOKENS, 'auto')))
      .toEqual(['tinyfish']);
  });

  it('prints the single-failure line when auto has one configured disabled provider', () => {
    const manifests = [fakeManifest('tavily')];
    const disabled = disabledReason([['tavily', 'provider failed: boom']]);

    expect(line(resolveSearchAttempts(manifests, disabled, TOKENS, 'auto')))
      .toBe('Web search failed (tavily): provider failed: boom.');
  });

  it('prints the every-provider-failed block in catalog order when all are disabled', () => {
    const manifests = [fakeManifest('tavily'), fakeManifest('tinyfish')];
    const disabled = disabledReason([
      ['tavily', 'provider failed: tavily boom'],
      ['tinyfish', 'provider failed: tinyfish boom'],
    ]);

    expect(line(resolveSearchAttempts(manifests, disabled, TOKENS, 'auto'))).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: tavily boom',
      '- tinyfish: provider failed: tinyfish boom',
    ].join('\n'));
  });

  it('ignores a search:false provider in auto, explicit lookup, and the available list', () => {
    const local = fakeManifest('local', { search: false, token: null });
    const manifests = [fakeManifest('tavily'), local, fakeManifest('tinyfish')];
    const disabled = disabledReason([['local', 'provider failed: local boom']]);

    expect(ids(resolveSearchAttempts(manifests, disabledReason(), TOKENS, 'auto')))
      .toEqual(['tavily', 'tinyfish']);
    expect(line(resolveSearchAttempts(manifests, disabledReason(), TOKENS, 'local')))
      .toBe('Web search: unknown provider "local" (available: auto, tavily, tinyfish).');
    expect(line(resolveSearchAttempts(manifests, disabled, TOKENS, 'local')))
      .toBe('Web search: unknown provider "local" (available: auto, tavily, tinyfish).');
  });

  it('counts a tokenless search-capable manifest as configured', () => {
    const manifests = [fakeManifest('local', { token: null })];

    expect(ids(resolveSearchAttempts(manifests, disabledReason(), {}, 'auto')))
      .toEqual(['local']);
  });

  it('never activates a manifest during resolution', () => {
    const tavily = fakeManifest('tavily');

    resolveSearchAttempts([tavily], disabledReason(), TOKENS, 'auto');
    resolveSearchAttempts([tavily], disabledReason(), TOKENS, 'tavily');

    expect(tavily.activate).not.toHaveBeenCalled();
  });
});
