import { describe, it, expect } from 'vitest';
import {
  WEB_FETCH_DEFAULT_FORMAT,
  WEB_FETCH_DEFAULT_MAX_CHARS,
  WEB_FETCH_DEFAULT_OFFSET,
  WEB_FETCH_DEFAULT_PROVIDER,
  WEB_FETCH_DEFAULT_TIMEOUT_SECONDS,
  WEB_FETCH_MAX_CHARS,
  WEB_FETCH_MAX_TIMEOUT_SECONDS,
  WEB_FETCH_MIN_CHARS,
  WEB_FETCH_MIN_OFFSET,
  WEB_FETCH_MIN_TIMEOUT_SECONDS,
  WEB_FETCH_USAGE,
  isWebFetchFormat,
  isWebFetchUrl,
  parseWebFetch,
} from './command.js';

const usage = { error: WEB_FETCH_USAGE };

const defaults = {
  format: WEB_FETCH_DEFAULT_FORMAT,
  timeoutSeconds: WEB_FETCH_DEFAULT_TIMEOUT_SECONDS,
  maxChars: WEB_FETCH_DEFAULT_MAX_CHARS,
  offset: WEB_FETCH_DEFAULT_OFFSET,
  provider: WEB_FETCH_DEFAULT_PROVIDER,
};

describe('exported defaults', () => {
  it('pins the promised default values', () => {
    expect({
      format: WEB_FETCH_DEFAULT_FORMAT,
      timeoutSeconds: WEB_FETCH_DEFAULT_TIMEOUT_SECONDS,
      maxChars: WEB_FETCH_DEFAULT_MAX_CHARS,
      offset: WEB_FETCH_DEFAULT_OFFSET,
      provider: WEB_FETCH_DEFAULT_PROVIDER,
    }).toEqual({ format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' });
  });

  it('pins the promised ranges', () => {
    expect([WEB_FETCH_MIN_TIMEOUT_SECONDS, WEB_FETCH_MAX_TIMEOUT_SECONDS]).toEqual([1, 120]);
    expect([WEB_FETCH_MIN_CHARS, WEB_FETCH_MAX_CHARS]).toEqual([200, 100_000]);
    expect(WEB_FETCH_MIN_OFFSET).toBe(0);
  });
});

describe('parseWebFetch', () => {
  it('fills in the defaults for the URL alone', () => {
    expect(parseWebFetch('web fetch https://example.com')).toEqual({ url: 'https://example.com', ...defaults });
  });

  it('parses each flag on its own', () => {
    expect(parseWebFetch('web fetch https://x --format text')).toEqual({ url: 'https://x', ...defaults, format: 'text' });
    expect(parseWebFetch('web fetch https://x --timeout 60')).toEqual({
      url: 'https://x',
      ...defaults,
      timeoutSeconds: 60,
    });
    expect(parseWebFetch('web fetch https://x --max-chars 500')).toEqual({
      url: 'https://x',
      ...defaults,
      maxChars: 500,
    });
    expect(parseWebFetch('web fetch https://x --offset 5')).toEqual({ url: 'https://x', ...defaults, offset: 5 });
    expect(parseWebFetch('web fetch https://x --provider tavily')).toEqual({
      url: 'https://x',
      ...defaults,
      provider: 'tavily',
    });
  });

  it('parses every flag in a non-default order', () => {
    const expected = {
      url: 'https://x',
      format: 'html',
      timeoutSeconds: 60,
      maxChars: 500,
      offset: 5,
      provider: 'tinyfish',
    };
    expect(parseWebFetch('web fetch https://x --provider tinyfish --offset 5 --max-chars 500 --timeout 60 --format html')).toEqual(
      expected,
    );
    expect(parseWebFetch('web fetch https://x --format html --timeout 60 --max-chars 500 --offset 5 --provider tinyfish')).toEqual(
      expected,
    );
  });

  it('lowercases the format and keeps the provider as typed', () => {
    expect(parseWebFetch('web fetch https://x --format TEXT')).toEqual({ url: 'https://x', ...defaults, format: 'text' });
    expect(parseWebFetch('web fetch https://x --format Markdown')).toEqual({ url: 'https://x', ...defaults, format: 'markdown' });
    expect(parseWebFetch('web fetch https://x --provider TaVily')).toEqual({ url: 'https://x', ...defaults, provider: 'TaVily' });
  });

  it('accepts the numeric range edges', () => {
    expect(parseWebFetch('web fetch https://x --timeout 1')).toEqual({ url: 'https://x', ...defaults, timeoutSeconds: 1 });
    expect(parseWebFetch('web fetch https://x --timeout 120')).toEqual({ url: 'https://x', ...defaults, timeoutSeconds: 120 });
    expect(parseWebFetch('web fetch https://x --max-chars 200')).toEqual({ url: 'https://x', ...defaults, maxChars: 200 });
    expect(parseWebFetch('web fetch https://x --max-chars 100000')).toEqual({ url: 'https://x', ...defaults, maxChars: 100_000 });
    expect(parseWebFetch('web fetch https://x --offset 0')).toEqual({ url: 'https://x', ...defaults, offset: 0 });
    expect(parseWebFetch('web fetch https://x --offset 123456')).toEqual({ url: 'https://x', ...defaults, offset: 123_456 });
  });

  it('accepts a leading zero on a non-zero number', () => {
    expect(parseWebFetch('web fetch https://x --timeout 007')).toEqual({ url: 'https://x', ...defaults, timeoutSeconds: 7 });
  });

  it('parses the typed form case-insensitively and collapses whitespace', () => {
    expect(parseWebFetch('WEB FETCH https://x')).toEqual({ url: 'https://x', ...defaults });
    expect(parseWebFetch('  \tweb \t fetch\t https://x\t  --timeout\t 5  ')).toEqual({
      url: 'https://x',
      ...defaults,
      timeoutSeconds: 5,
    });
  });

  it('accepts http and https URLs and keeps them as typed', () => {
    expect(parseWebFetch('web fetch HTTPS://Example.com/A')).toEqual({ url: 'HTTPS://Example.com/A', ...defaults });
    expect(parseWebFetch('web fetch http://localhost:3000/x')).toEqual({ url: 'http://localhost:3000/x', ...defaults });
  });

  it('returns the usage line for a missing URL or command', () => {
    expect(parseWebFetch('web fetch')).toEqual(usage);
    expect(parseWebFetch('web')).toEqual(usage);
    expect(parseWebFetch('web search https://x')).toEqual(usage);
    expect(parseWebFetch('web foo https://x')).toEqual(usage);
    expect(parseWebFetch('')).toEqual(usage);
    expect(parseWebFetch(' '.repeat(3))).toEqual(usage);
  });

  it('returns the usage line for a flag before the URL', () => {
    expect(parseWebFetch('web fetch --format text')).toEqual(usage);
    expect(parseWebFetch('web fetch --timeout 5 https://x')).toEqual(usage);
  });

  it('returns the usage line for a refused URL', () => {
    expect(parseWebFetch('web fetch ftp://x')).toEqual(usage);
    expect(parseWebFetch('web fetch file:///etc')).toEqual(usage);
    expect(parseWebFetch('web fetch example.com')).toEqual(usage);
    expect(parseWebFetch('web fetch https://')).toEqual(usage);
  });

  it('returns the usage line for an unknown flag', () => {
    expect(parseWebFetch('web fetch https://x --bogus x')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --prompt x')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --mode fast')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --FORMAT text')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --format=text')).toEqual(usage);
  });

  it('returns the usage line for a repeated flag', () => {
    expect(parseWebFetch('web fetch https://x --format text --format html')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --offset 0 --offset 5')).toEqual(usage);
  });

  it('returns the usage line for a missing flag value', () => {
    expect(parseWebFetch('web fetch https://x --timeout')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --provider --format')).toEqual(usage);
  });

  it('returns the usage line for a timeout out of range or not whole', () => {
    expect(parseWebFetch('web fetch https://x --timeout 0')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --timeout 121')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --timeout 1.5')).toEqual(usage);
  });

  it('returns the usage line for max-chars out of range', () => {
    expect(parseWebFetch('web fetch https://x --max-chars 199')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --max-chars 100001')).toEqual(usage);
  });

  it('returns the usage line for a refused offset', () => {
    expect(parseWebFetch('web fetch https://x --offset -1')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --offset 00')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x --offset 9007199254740992')).toEqual(usage);
  });

  it('returns the usage line for an unknown format', () => {
    expect(parseWebFetch('web fetch https://x --format pdf')).toEqual(usage);
  });

  it('returns the usage line for an extra word or a second URL', () => {
    expect(parseWebFetch('web fetch https://x extra')).toEqual(usage);
    expect(parseWebFetch('web fetch https://x https://y')).toEqual(usage);
  });
});

describe('WEB_FETCH_USAGE', () => {
  it('is the exact usage line', () => {
    expect(WEB_FETCH_USAGE).toBe(
      'Usage: web fetch <url> [--format markdown|text|html] [--timeout <1-120>] [--max-chars <200-100000>] [--offset <n>] [--provider <name>]',
    );
  });

  it('matches the numeric constants', () => {
    expect(WEB_FETCH_USAGE).toContain(`<${String(WEB_FETCH_MIN_TIMEOUT_SECONDS)}-${String(WEB_FETCH_MAX_TIMEOUT_SECONDS)}>`);
    expect(WEB_FETCH_USAGE).toContain(`<${String(WEB_FETCH_MIN_CHARS)}-${String(WEB_FETCH_MAX_CHARS)}>`);
  });
});

describe('guards', () => {
  it('isWebFetchFormat accepts only the three formats', () => {
    expect(isWebFetchFormat('markdown')).toBe(true);
    expect(isWebFetchFormat('text')).toBe(true);
    expect(isWebFetchFormat('html')).toBe(true);
    expect(isWebFetchFormat('Markdown')).toBe(false);
    expect(isWebFetchFormat('pdf')).toBe(false);
    expect(isWebFetchFormat(3)).toBe(false);
  });

  it('isWebFetchUrl accepts only http and https URLs', () => {
    expect(isWebFetchUrl('https://example.com')).toBe(true);
    expect(isWebFetchUrl('http://localhost:3000')).toBe(true);
    expect(isWebFetchUrl('ftp://x')).toBe(false);
    expect(isWebFetchUrl('example.com')).toBe(false);
  });
});
