import { describe, expect, it } from 'vitest';
import type { WebSearchResult } from './contract.js';
import { dedupeResults, normalizeResults, renderResults } from './render.js';

function result(title: string, url: string, snippet = ''): WebSearchResult {
  return { title, url, snippet };
}

function titles(results: WebSearchResult[]): string[] {
  return results.map((entry) => entry.title);
}

function dedupe(results: WebSearchResult[]): WebSearchResult[] {
  return dedupeResults(normalizeResults(results));
}

describe('normalizeResults', () => {
  it('collapses whitespace runs in titles and snippets and trims the ends', () => {
    const [normalized] = normalizeResults([
      result('  Node\n\tjs  ', 'https://example.com/', ' one\n\n two\tthree '),
    ]);
    expect(normalized).toEqual(result('Node js', 'https://example.com/', 'one two three'));
  });

  it('backslash-escapes brackets and backslashes in a title exactly once', () => {
    const [normalized] = normalizeResults([result(String.raw`a\[b]c`, 'https://example.com/')]);
    expect(normalized.title).toBe(String.raw`a\\\[b\]c`);
  });

  it('percent-encodes spaces and parentheses in a URL', () => {
    const [normalized] = normalizeResults([result('Doc', 'https://example.com/a b(c)')]);
    expect(normalized.url).toBe('https://example.com/a%20b%28c%29');
  });

  it('replaces an empty or whitespace-only title with the encoded URL', () => {
    expect(normalizeResults([result('', 'https://example.com/a b')])[0]?.title).toBe(
      'https://example.com/a%20b',
    );
    expect(normalizeResults([result(' \n\t ', 'https://example.com/')])[0]?.title).toBe(
      'https://example.com/',
    );
  });

  it('escapes the brackets in a URL used as the fallback title', () => {
    expect(normalizeResults([result('', 'http://[::1]/')])[0]?.title).toBe(
      String.raw`http://\[::1\]/`,
    );
  });

  it('drops non-http(s), relative, and unparseable URLs', () => {
    const normalized = normalizeResults([
      result('ftp', 'ftp://example.com/file'),
      result('script', 'javascript:alert(1)'),
      result('relative', '/a/b'),
      result('unparseable', 'not a url'),
      result('kept', 'https://example.com/'),
    ]);
    expect(normalized).toEqual([result('kept', 'https://example.com/')]);
  });

  it('keeps the given order', () => {
    const normalized = normalizeResults([
      result('b', 'https://example.com/b'),
      result('a', 'https://example.com/a'),
    ]);
    expect(titles(normalized)).toEqual(['b', 'a']);
  });
});

describe('dedupeResults', () => {
  it('treats a lowercased scheme and host, a dropped fragment, and a trailing slash as one result', () => {
    const kept = dedupe([
      result('first', 'HTTPS://Example.COM/a/'),
      result('second', 'https://example.com/a#x'),
    ]);
    expect(kept).toEqual([result('first', 'https://example.com/a/')]);
  });

  it('keeps query strings distinct while ignoring one trailing path slash', () => {
    expect(
      dedupe([result('a', 'https://e.com/a/?q=1'), result('b', 'https://e.com/a?q=1')]),
    ).toHaveLength(1);
    expect(
      dedupe([result('a', 'https://e.com/a?q=1'), result('b', 'https://e.com/a?q=2')]),
    ).toHaveLength(2);
  });

  it('treats a bare host and its root path as one result', () => {
    const kept = dedupe([result('first', 'https://e.com'), result('second', 'https://e.com/')]);
    expect(kept).toEqual([result('first', 'https://e.com/')]);
  });

  it('treats encoded and unencoded parentheses in the path as one result', () => {
    expect(
      dedupe([result('a', 'https://e.com/(x)'), result('b', 'https://e.com/%28x%29')]),
    ).toHaveLength(1);
  });

  it('keeps the first occurrence and the original order', () => {
    const kept = dedupe([
      result('one', 'https://e.com/1'),
      result('two', 'https://e.com/2'),
      result('one again', 'https://e.com/1/'),
    ]);
    expect(titles(kept)).toEqual(['one', 'two']);
  });
});

describe('renderResults', () => {
  it('renders a Markdown list with an indented snippet and no header or trailing newline', () => {
    const results = [
      result('First', 'https://e.com/1', 'Alpha'),
      result('Second', 'https://e.com/2'),
    ];
    expect(renderResults(results, 2, 10_000)).toBe(
      ['- [First](https://e.com/1)', '  Alpha', '- [Second](https://e.com/2)'].join('\n'),
    );
  });

  it('keeps the leading whole results that fit and notes how many it shows', () => {
    const results = [
      result('One', 'https://e.com/1', 'first'),
      result('Two', 'https://e.com/2', 'second'),
      result('Three', 'https://e.com/3', 'third'),
    ];
    const first = '- [One](https://e.com/1)\n  first';
    const note = '(showing 1 of 3 results; raise --max-chars for more)';
    const budget = first.length + 1 + note.length;
    const rendered = renderResults(results, 3, budget);
    expect(rendered).toBe(`${first}\n${note}`);
    expect(rendered.length).toBeLessThanOrEqual(budget);
  });

  it('keeps every result when the budget equals the full rendering and drops one a character less', () => {
    const results = [
      result('One', 'https://e.com/1', 'first'),
      result('Two', 'https://e.com/2', 'x'.repeat(200)),
    ];
    const full = renderResults(results, 2, 10_000);
    expect(renderResults(results, 2, full.length)).toBe(full);
    expect(renderResults(results, 2, full.length)).not.toContain('(showing');
    const shorter = renderResults(results, 2, full.length - 1);
    expect(shorter).toBe(
      [
        '- [One](https://e.com/1)',
        '  first',
        '(showing 1 of 2 results; raise --max-chars for more)',
      ].join('\n'),
    );
  });

  it('uses the total argument verbatim as the note denominator', () => {
    expect(renderResults([result('One', 'https://e.com/1', 'first')], 4, 10_000)).toBe(
      [
        '- [One](https://e.com/1)',
        '  first',
        '(showing 1 of 4 results; raise --max-chars for more)',
      ].join('\n'),
    );
  });

  it('cuts the first result snippet with an ellipsis so the output fits the budget', () => {
    const results = [
      result('Long', 'https://example.com/long', 'x'.repeat(500)),
      result('Other', 'https://example.com/other', 'y'.repeat(500)),
    ];
    const maxChars = 200;
    const link = '- [Long](https://example.com/long)';
    const note = '(showing 1 of 2 results; raise --max-chars for more)';
    const room = maxChars - link.length - 3 - 1 - note.length;
    const snippet = `${'x'.repeat(room - 1)}…`;
    const rendered = renderResults(results, 2, maxChars);
    expect(rendered).toBe(`${link}\n  ${snippet}\n${note}`);
    expect(rendered.length).toBe(maxChars);
  });

  it('prints the link line alone when the note cannot fit alongside it', () => {
    const url = `https://example.com/${'a'.repeat(120)}`;
    const link = `- [Long](${url})`;
    const note = '(showing 1 of 2 results; raise --max-chars for more)';
    expect(link.length).toBe(150);
    expect(link.length + 1 + note.length).toBe(203);
    const rendered = renderResults(
      [result('Long', url, 'short'), result('Other', 'https://example.com/other', 'other')],
      2,
      200,
    );
    expect(rendered).toBe(link);
    expect(rendered.length).toBeLessThanOrEqual(200);
  });

  it('keeps the note without a snippet when the link line and note fill the budget', () => {
    const url = `https://example.com/${'a'.repeat(117)}`;
    const link = `- [Long](${url})`;
    const note = '(showing 1 of 2 results; raise --max-chars for more)';
    expect(link.length).toBe(147);
    expect(link.length + 1 + note.length).toBe(200);
    const rendered = renderResults(
      [result('Long', url, 'short'), result('Other', 'https://example.com/other', 'y'.repeat(100))],
      2,
      200,
    );
    expect(rendered).toBe(`${link}\n${note}`);
  });

  it('prints an ellipsis-only snippet when one character of snippet room remains', () => {
    const url = `https://example.com/${'a'.repeat(113)}`;
    const link = `- [Long](${url})`;
    const note = '(showing 1 of 2 results; raise --max-chars for more)';
    expect(link.length).toBe(143);
    const rendered = renderResults(
      [result('Long', url, 'short'), result('Other', 'https://example.com/other', 'y'.repeat(100))],
      2,
      200,
    );
    expect(rendered).toBe(`${link}\n  …\n${note}`);
    expect(rendered.length).toBe(200);
  });

  it('does not leave a lone high surrogate at the end of a cut snippet', () => {
    const link = '- [Emoji](https://e.com/emoji)';
    const maxChars = link.length + 3 + 6;
    const snippet = `${'a'.repeat(4)}😀tail`;
    const rendered = renderResults([result('Emoji', 'https://e.com/emoji', snippet)], 1, maxChars);
    expect(rendered).toBe(`${link}\n  aaaa…`);
  });

  it('prints first result link line longer than the budget whole, with no snippet', () => {
    const url = `https://example.com/${'a'.repeat(100)}`;
    expect(renderResults([result('Long URL', url, 'snippet')], 1, 50)).toBe(`- [Long URL](${url})`);
  });

  it('renders an empty list as an empty string', () => {
    expect(renderResults([], 0, 200)).toBe('');
  });
});
