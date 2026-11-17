import { describe, expect, it } from 'vitest';
import type { FetchedPage } from './render.js';
import { renderFetched, renderRedirect } from './render.js';

const URL = 'https://e.com/';
const SOURCE = 's';
const HEADER = `Fetched ${URL} (${SOURCE}).\n\n`;
const HIGH = '\u{D800}';
const LOW = '\u{DE00}';

function page(content: string, url = URL, source = SOURCE): FetchedPage {
  return { url, source, content };
}

function parse(rendered: string): { body: string; next: number | undefined } {
  const text = rendered.slice(HEADER.length);
  const match = /\n\(showing characters \d+-\d+ of \d+; continue with --offset (\d+)\)$/.exec(text);
  if (match === null) return { body: text, next: undefined };
  return { body: text.slice(0, match.index), next: Number(match[1]) };
}

function rebuild(content: string, maxChars: number): string {
  let offset = 0;
  let rebuilt = '';
  for (;;) {
    const { body, next } = parse(renderFetched(page(content), offset, maxChars));
    rebuilt += body;
    if (next === undefined) return rebuilt;
    expect(next).toBeGreaterThan(offset);
    offset = next;
  }
}

describe('renderFetched', () => {
  it('prints a short page whole with a source line, empty line and no note', () => {
    expect(renderFetched(page('Hello world'), 0, 1000)).toBe(`${HEADER}Hello world`);
  });

  it('prints a rest that fits maxChars exactly with no note', () => {
    const content = 'abcdefghij';
    const budget = HEADER.length + (content.length - 3);
    expect(renderFetched(page(content), 3, budget)).toBe(`${HEADER}defghij`);
  });

  it('prints a slice from offset 0 with a note that fills maxChars exactly', () => {
    const rendered = renderFetched(page('x'.repeat(300)), 0, 200);
    expect(rendered).toBe(
      `${HEADER}${'x'.repeat(109)}\n(showing characters 0-109 of 300; continue with --offset 109)`,
    );
    expect(rendered.length).toBe(200);
  });

  it('starts a slice at a non-zero offset and prints that offset as the note start', () => {
    expect(renderFetched(page('x'.repeat(300)), 25, 200)).toBe(
      `${HEADER}${'x'.repeat(108)}\n(showing characters 25-133 of 300; continue with --offset 133)`,
    );
  });

  it('leaves slack when the slice end has fewer digits than the total', () => {
    const rendered = renderFetched(page('x'.repeat(1000)), 0, 200);
    expect(rendered).toBe(
      `${HEADER}${'x'.repeat(106)}\n(showing characters 0-106 of 1000; continue with --offset 106)`,
    );
    expect(rendered.length).toBe(198);
  });

  it('prints the last slice whole with no note', () => {
    expect(renderFetched(page('abcdefghij'), 8, 1000)).toBe(`${HEADER}ij`);
  });

  it('rebuilds ASCII content exactly by following each note', () => {
    const content = 'abcdefghij'.repeat(30);
    expect(rebuild(content, 120)).toBe(content);
  });

  it('rebuilds emoji content exactly by following each note', () => {
    const content = '😀🙂🚀'.repeat(40);
    expect(rebuild(content, 120)).toBe(content);
  });

  it('moves the end back one unit rather than split a surrogate pair', () => {
    const content = `${'a'.repeat(20)}😀${'b'.repeat(100)}`;
    expect(renderFetched(page(content), 0, 112)).toBe(
      `${HEADER}${'a'.repeat(20)}\n(showing characters 0-20 of 122; continue with --offset 20)`,
    );
  });

  it('leaves a lone high surrogate before the end in place', () => {
    const content = `${'a'.repeat(20)}${HIGH}${'b'.repeat(100)}`;
    expect(renderFetched(page(content), 0, 112)).toBe(
      `${HEADER}${'a'.repeat(20)}${HIGH}\n(showing characters 0-21 of 121; continue with --offset 21)`,
    );
  });

  it('keeps a whole pair when one unit of room lands on a high surrogate', () => {
    expect(renderFetched(page('😀tail'), 0, 30)).toBe(
      `${HEADER}😀\n(showing characters 0-2 of 6; continue with --offset 2)`,
    );
  });

  it('prints one unit and the note past maxChars with a very long URL', () => {
    const url = `https://e.com/${'a'.repeat(150)}`;
    const longHeader = `Fetched ${url} (s).\n\n`;
    const rendered = renderFetched(page('abcdef', url, 's'), 0, 100);
    expect(rendered).toBe(
      `${longHeader}a\n(showing characters 0-1 of 6; continue with --offset 1)`,
    );
    expect(rendered.length).toBeGreaterThan(100);
  });

  it('starts at the low surrogate of an offset inside a pair and prints that offset', () => {
    expect(renderFetched(page(`😀${'x'.repeat(200)}`), 1, 60)).toBe(
      `${HEADER}${LOW}\n(showing characters 1-2 of 202; continue with --offset 2)`,
    );
  });

  it('prints the URL and content verbatim', () => {
    const url = 'https://e.com/a (b)/c?x=1';
    const source = 'site name';
    const content = '  first\r\n  second  ';
    expect(renderFetched(page(content, url, source), 0, 1000)).toBe(
      `Fetched ${url} (${source}).\n\n${content}`,
    );
  });

  it('prints the empty-page answer at any offset', () => {
    expect(renderFetched(page(''), 0, 1000)).toBe(`${HEADER}(empty page)`);
    expect(renderFetched(page(''), 3, 1000)).toBe(`${HEADER}(empty page)`);
  });

  it('prints the past-the-end answer for offsets at and beyond the length', () => {
    const past = (offset: number) =>
      `${HEADER}(offset ${offset} is past the end; the page has 3 characters)`;
    expect(renderFetched(page('abc'), 3, 1000)).toBe(past(3));
    expect(renderFetched(page('abc'), 5, 1000)).toBe(past(5));
  });

  it('prints a non-slice answer whole even when it exceeds maxChars', () => {
    const url = `https://e.com/${'a'.repeat(150)}`;
    const longHeader = `Fetched ${url} (s).\n\n`;
    const rendered = renderFetched(page('', url, 's'), 0, 20);
    expect(rendered).toBe(`${longHeader}(empty page)`);
    expect(rendered.length).toBeGreaterThan(20);
  });
});

describe('renderRedirect', () => {
  it('prints the redirected-to URL verbatim', () => {
    expect(renderRedirect('https://e.com/next')).toBe(
      'Web fetch: redirected to https://e.com/next.',
    );
    expect(renderRedirect('https://e.com/a (b)')).toBe(
      'Web fetch: redirected to https://e.com/a (b).',
    );
  });
});
