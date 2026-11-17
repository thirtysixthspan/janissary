import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ProjectTokenName, ProjectTokens } from '../../project/tokens.js';
import { WEB_PROVIDER_API_VERSION } from './contract.js';
import type {
  WebFetchFormat,
  WebSearchProviderManifest,
  WebSearchProviderModule,
} from './contract.js';
import { resolveFetchAttempts } from './fetch-resolution.js';
import type { AttemptResolution, DisabledReason } from './resolution.js';

const TOKENS: ProjectTokens = { tavily: 'tavily-key', tinyfish: 'tinyfish-key' };
const ALL_FORMATS: readonly WebFetchFormat[] = ['markdown', 'text', 'html'];

type FakeManifestOptions = {
  token?: ProjectTokenName | null;
  search?: boolean;
  formats?: readonly WebFetchFormat[];
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
    ...(options.formats !== undefined && { fetchFormats: options.formats }),
    activate: vi.fn(async () => ({ provider: {} })),
  };
}

function bundledLike(): FakeManifest[] {
  return [
    fakeManifest('searchonly', { search: true, token: null }),
    fakeManifest('tavily', { formats: ['markdown', 'text'] }),
    fakeManifest('tinyfish', { formats: ['markdown', 'html'] }),
    fakeManifest('local', { token: null, search: false, formats: ALL_FORMATS }),
  ];
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

describe('resolveFetchAttempts', () => {
  it('lists eligible providers in catalog order for auto when every token is present', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'markdown')))
      .toEqual(['tavily', 'tinyfish', 'local']);
  });

  it('skips a provider whose token is missing or the empty string', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), { tavily: 'key' }, 'auto', 'markdown')))
      .toEqual(['tavily', 'local']);
    expect(ids(resolveFetchAttempts(
      manifests, disabledReason(), { tavily: '', tinyfish: 'key' }, 'auto', 'markdown',
    ))).toEqual(['tinyfish', 'local']);
  });

  it('skips a provider that does not serve the requested format', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'text')))
      .toEqual(['tavily', 'local']);
    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'html')))
      .toEqual(['tinyfish', 'local']);
  });

  it('skips a disabled provider', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([['tinyfish', 'provider failed: boom']]);

    expect(ids(resolveFetchAttempts(manifests, disabled, TOKENS, 'auto', 'markdown')))
      .toEqual(['tavily', 'local']);
  });

  it('treats AUTO and Auto as auto', () => {
    const manifests = bundledLike();
    const none = disabledReason();

    expect(ids(resolveFetchAttempts(manifests, none, TOKENS, 'AUTO', 'markdown')))
      .toEqual(['tavily', 'tinyfish', 'local']);
    expect(ids(resolveFetchAttempts(manifests, none, TOKENS, 'Auto', 'markdown')))
      .toEqual(['tavily', 'tinyfish', 'local']);
  });

  it('prints the stored failure when the only eligible provider is disabled', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([['local', 'provider failed: local boom']]);

    expect(line(resolveFetchAttempts(manifests, disabled, {}, 'auto', 'markdown')))
      .toBe('Web fetch failed (local): provider failed: local boom.');
  });

  it('prints the every-attempt block in catalog order when all eligible providers are disabled', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([
      ['tavily', 'provider failed: tavily boom'],
      ['tinyfish', 'provider failed: tinyfish boom'],
      ['local', 'provider failed: local boom'],
    ]);

    expect(line(resolveFetchAttempts(manifests, disabled, TOKENS, 'auto', 'markdown'))).toBe([
      'Web fetch: every attempt failed.',
      '- tavily: provider failed: tavily boom',
      '- tinyfish: provider failed: tinyfish boom',
      '- local: provider failed: local boom',
    ].join('\n'));
  });

  it('leaves a disabled but unconfigured provider out of the every-attempt block', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([
      ['tavily', 'provider failed: tavily boom'],
      ['tinyfish', 'provider failed: tinyfish boom'],
      ['local', 'provider failed: local boom'],
    ]);

    expect(line(resolveFetchAttempts(manifests, disabled, { tavily: 'key' }, 'auto', 'markdown')))
      .toBe([
        'Web fetch: every attempt failed.',
        '- tavily: provider failed: tavily boom',
        '- local: provider failed: local boom',
      ].join('\n'));
  });

  it('reports no provider when no injected manifest is configured', () => {
    const manifests = [
      fakeManifest('tavily', { formats: ['markdown', 'text'] }),
      fakeManifest('tinyfish', { formats: ['markdown', 'html'] }),
    ];

    expect(line(resolveFetchAttempts(manifests, disabledReason(), {}, 'auto', 'markdown')))
      .toBe('Web fetch: no provider configured.');
  });

  it('reports no provider when none serves the requested format', () => {
    const manifests = [fakeManifest('tavily', { formats: ['markdown', 'text'] })];

    expect(line(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'html')))
      .toBe('Web fetch: no provider configured.');
  });

  it('counts a tokenless provider as configured', () => {
    const manifests = [fakeManifest('local', { token: null, search: false, formats: ALL_FORMATS })];

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), {}, 'auto', 'markdown')))
      .toEqual(['local']);
  });

  it('never attempts a search-only manifest', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'markdown')))
      .toEqual(['tavily', 'tinyfish', 'local']);
  });

  it('never includes a search-only manifest even when every fetch provider is disabled', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([
      ['searchonly', 'provider failed: searchonly boom'],
      ['tavily', 'provider failed: tavily boom'],
      ['tinyfish', 'provider failed: tinyfish boom'],
      ['local', 'provider failed: local boom'],
    ]);

    expect(line(resolveFetchAttempts(manifests, disabled, TOKENS, 'auto', 'markdown'))).toBe([
      'Web fetch: every attempt failed.',
      '- tavily: provider failed: tavily boom',
      '- tinyfish: provider failed: tinyfish boom',
      '- local: provider failed: local boom',
    ].join('\n'));
  });

  it('reports an unknown name with the name as typed and only fetch-capable ids available', () => {
    const manifests = bundledLike();

    expect(line(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'Bing', 'markdown')))
      .toBe('Web fetch: unknown provider "Bing" (available: auto, tavily, tinyfish, local).');
    expect(line(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'searchonly', 'markdown')))
      .toBe('Web fetch: unknown provider "searchonly" (available: auto, tavily, tinyfish, local).');
  });

  it('never activates a manifest during resolution', () => {
    const manifests = bundledLike();

    resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'auto', 'markdown');
    resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'Bing', 'markdown');

    for (const manifest of manifests) {
      expect(manifest.activate).not.toHaveBeenCalled();
    }
  });
});

describe('resolveFetchAttempts with an explicit --provider', () => {
  it('resolves a mixed-case name to that provider alone', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'TinyFish', 'markdown')))
      .toEqual(['tinyfish']);
  });

  it('resolves local alone even when both remote providers are configured', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'local', 'markdown')))
      .toEqual(['local']);
    expect(ids(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'LOCAL', 'markdown')))
      .toEqual(['local']);
  });

  it('counts a tokenless provider as configured with empty tokens', () => {
    const manifests = bundledLike();

    expect(ids(resolveFetchAttempts(manifests, disabledReason(), {}, 'local', 'markdown')))
      .toEqual(['local']);
  });

  it('prints the unknown line with the name as typed and only fetch-capable ids available', () => {
    const manifests = bundledLike();

    expect(line(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'Bing', 'markdown')))
      .toBe('Web fetch: unknown provider "Bing" (available: auto, tavily, tinyfish, local).');
  });

  it('treats a search-only provider as unknown even when disabled', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([['searchonly', 'provider failed: searchonly boom']]);

    expect(line(resolveFetchAttempts(manifests, disabled, TOKENS, 'searchonly', 'markdown')))
      .toBe('Web fetch: unknown provider "searchonly" (available: auto, tavily, tinyfish, local).');
  });

  it('prints the not-configured line for a missing or empty token', () => {
    const manifests = bundledLike();

    expect(line(resolveFetchAttempts(manifests, disabledReason(), {}, 'tavily', 'markdown')))
      .toBe('Web fetch: provider "tavily" is not configured.');
    expect(line(resolveFetchAttempts(manifests, disabledReason(), { tavily: '' }, 'tavily', 'markdown')))
      .toBe('Web fetch: provider "tavily" is not configured.');
  });

  it('prints the unsupported-format line for a configured provider', () => {
    const manifests = bundledLike();

    expect(line(resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'tavily', 'html')))
      .toBe('Web fetch: provider "tavily" does not support --format html.');
  });

  it('prints the disabled line and lets it win over not configured and unsupported format', () => {
    const manifests = bundledLike();
    const disabled = disabledReason([['tavily', 'provider failed: tavily boom']]);

    expect(line(resolveFetchAttempts(manifests, disabled, TOKENS, 'tavily', 'markdown')))
      .toBe('Web fetch failed (tavily): provider failed: tavily boom.');
    expect(line(resolveFetchAttempts(manifests, disabled, {}, 'tavily', 'markdown')))
      .toBe('Web fetch failed (tavily): provider failed: tavily boom.');
    expect(line(resolveFetchAttempts(manifests, disabled, TOKENS, 'tavily', 'html')))
      .toBe('Web fetch failed (tavily): provider failed: tavily boom.');
  });

  it('lets not configured win over an unsupported format', () => {
    const manifests = bundledLike();

    expect(line(resolveFetchAttempts(manifests, disabledReason(), {}, 'tavily', 'html')))
      .toBe('Web fetch: provider "tavily" is not configured.');
  });

  it('never activates a manifest during any explicit resolution', () => {
    const manifests = bundledLike();

    resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'tinyfish', 'markdown');
    resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'local', 'markdown');
    resolveFetchAttempts(manifests, disabledReason(), TOKENS, 'Bing', 'markdown');

    for (const manifest of manifests) {
      expect(manifest.activate).not.toHaveBeenCalled();
    }
  });
});
