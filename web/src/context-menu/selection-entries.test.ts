import { describe, expect, it, vi } from 'vitest';
import { OPEN_URL_LABEL, selectionEntries, selectionUrl } from './selection-entries';

describe('selectionUrl', () => {
  it.each([
    'https://example.com',
    // eslint-disable-next-line unicorn/prefer-https
    'http://example.com/path?query=1#hash',
    'HTTPS://Example.com/Upper',
    'https://localhost:5173/',
  ])('accepts %s', (text) => {
    expect(selectionUrl(text)).toBe(text);
  });

  it('trims the whitespace a drag selection picks up around the address', () => {
    expect(selectionUrl('  https://example.com/page\n')).toBe('https://example.com/page');
  });

  it.each([
    ['plain text', 'selected text'],
    ['a bare domain', 'example.com'],
    ['a javascript: address', 'javascript:alert(1)'],
    ['a file: address', 'file:///etc/passwd'],
    ['an ftp: address', 'ftp://example.com'],
    ['a sentence containing a link', 'see https://example.com for details'],
    ['two addresses', 'https://a.example https://b.example'],
    ['a scheme with no host', 'https://'],
    ['an empty selection', ''],
  ])('rejects %s', (_name, text) => {
    expect(selectionUrl(text)).toBeNull();
  });
});

describe('selectionEntries', () => {
  const contributed = [{ label: 'Search for this' }, { label: 'Chat about this', shortcut: true as const }];

  function actions() {
    return { openUrl: vi.fn(), runContributed: vi.fn() };
  }

  it('puts Open this URL ahead of the contributed entries for a URL selection', () => {
    const entries = selectionEntries('https://example.com', contributed, actions());
    expect(entries.map((entry) => entry.label)).toEqual([OPEN_URL_LABEL, 'Search for this', 'Chat about this']);
  });

  it('offers Open this URL before any contribution has arrived', () => {
    const entries = selectionEntries('https://example.com', [], actions());
    expect(entries.map((entry) => entry.label)).toEqual([OPEN_URL_LABEL]);
  });

  it('leaves Open this URL out for a selection that is not a URL', () => {
    expect(selectionEntries('selected text', contributed, actions()).map((entry) => entry.label))
      .toEqual(['Search for this', 'Chat about this']);
    expect(selectionEntries('selected text', [], actions())).toEqual([]);
  });

  it('opens the trimmed address and runs contributed entries by label', () => {
    const handlers = actions();
    const [open, search] = selectionEntries(' https://example.com/a ', contributed, handlers);
    open.onActivate();
    search.onActivate();
    expect(handlers.openUrl).toHaveBeenCalledExactlyOnceWith('https://example.com/a');
    expect(handlers.runContributed).toHaveBeenCalledExactlyOnceWith('Search for this');
  });
});
