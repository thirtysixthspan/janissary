import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const sanitize = (text: string) =>
  DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));

describe('Markdown DOMPurify sanitization', () => {
  it('strips inline event handlers from img tags', () => {
    const out = sanitize('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', () => {
    const out = sanitize('[click me](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('strips script tags', () => {
    const out = sanitize('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });

  it('preserves safe markdown (headings, bold, links)', () => {
    const out = sanitize('# Hello\n**bold** [safe](https://example.com)');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong');
    expect(out).toContain('https://example.com');
  });
});
