import { describe, it, expect, vi } from 'vitest';
import DOMPurify from 'dompurify';

vi.mock('marked', () => ({ marked: { parse: vi.fn() } }));

type MarkedParse = ReturnType<typeof vi.fn> & ((source: string, options?: unknown) => string);
type MarkedModule = { marked: { parse: MarkedParse } };

// The sanitize cases below exercise the real marked pipeline, so each one points the module-level
// mock at the actual implementation before running the same options renderMarkdown uses.
const withRealParse = async () => {
  const mocked = await import('marked') as unknown as MarkedModule;
  const actual = await vi.importActual('marked') as {
    marked: { parse: (source: string, options?: unknown) => string };
  };
  mocked.marked.parse.mockImplementation(actual.marked.parse);
  return mocked;
};

const sanitize = async (text: string) => {
  const { marked } = await withRealParse();
  return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));
};

describe('renderMarkdown', () => {
  it('returns undefined when marked.parse throws', async () => {
    const { marked } = await import('marked') as unknown as MarkedModule;
    marked.parse.mockImplementation(() => { throw new Error('boom'); });
    const { renderMarkdown } = await import('./markdown');
    expect(renderMarkdown('# hello')).toBeUndefined();
  });

  it('strips inline event handlers from img tags', async () => {
    const out = await sanitize('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', async () => {
    const out = await sanitize('[click me](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('strips script tags', async () => {
    const out = await sanitize('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });

  it('preserves safe markdown (headings, bold, links)', async () => {
    const out = await sanitize('# Hello\n**bold** [safe](https://example.com)');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong');
    expect(out).toContain('https://example.com');
  });
});
