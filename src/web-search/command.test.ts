import { describe, it, expect } from 'vitest';
import {
  WEB_SEARCH_DEFAULT_DEPTH,
  WEB_SEARCH_DEFAULT_MAX_CHARS,
  WEB_SEARCH_DEFAULT_PROVIDER,
  WEB_SEARCH_DEFAULT_RESULTS,
  WEB_SEARCH_MAX_CHARS,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_MIN_CHARS,
  WEB_SEARCH_MIN_RESULTS,
  WEB_SEARCH_PRIMER,
  WEB_SEARCH_USAGE,
  isWebCommandLine,
  isWebSearchReplyLine,
  parseWebSearch,
} from './command.js';

const usage = { error: WEB_SEARCH_USAGE };

const defaults = {
  numResults: WEB_SEARCH_DEFAULT_RESULTS,
  maxChars: WEB_SEARCH_DEFAULT_MAX_CHARS,
  depth: WEB_SEARCH_DEFAULT_DEPTH,
  provider: WEB_SEARCH_DEFAULT_PROVIDER,
};

describe('exported defaults', () => {
  it('pins the promised default values', () => {
    expect({
      numResults: WEB_SEARCH_DEFAULT_RESULTS,
      maxChars: WEB_SEARCH_DEFAULT_MAX_CHARS,
      depth: WEB_SEARCH_DEFAULT_DEPTH,
      provider: WEB_SEARCH_DEFAULT_PROVIDER,
    }).toEqual({ numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' });
  });

  it('states the default result count in the primer', () => {
    expect(WEB_SEARCH_PRIMER).toContain(`up to ${String(WEB_SEARCH_DEFAULT_RESULTS)} results by default`);
  });
});

describe('parseWebSearch', () => {
  it('fills in the defaults for the query alone', () => {
    expect(parseWebSearch('web search node.js')).toEqual({ query: 'node.js', ...defaults });
  });

  it('takes the query up to the first flag and collapses whitespace', () => {
    expect(parseWebSearch('  \tweb \t search\t node.js\t  permission   model  ')).toEqual({
      query: 'node.js permission model',
      ...defaults,
    });
    expect(parseWebSearch('web search rust async --results 5')).toEqual({
      query: 'rust async',
      ...defaults,
      numResults: 5,
    });
  });

  it('keeps quotes and site operators as typed', () => {
    expect(parseWebSearch('web search "exact phrase" site:example.com -site:bad.example')).toEqual({
      query: '"exact phrase" site:example.com -site:bad.example',
      ...defaults,
    });
  });

  it('treats a single-dash token as a query word', () => {
    expect(parseWebSearch('web search -site:example.com x')).toEqual({ query: '-site:example.com x', ...defaults });
  });

  it('parses the typed form case-insensitively and keeps the query case', () => {
    expect(parseWebSearch('Web Search Node.js')).toEqual({ query: 'Node.js', ...defaults });
  });

  it('keeps the provider value as typed, including auto and unregistered names', () => {
    expect(parseWebSearch('web search x --provider Tavily')).toEqual({ query: 'x', ...defaults, provider: 'Tavily' });
    expect(parseWebSearch('web search x --provider auto')).toEqual({ query: 'x', ...defaults, provider: 'auto' });
    expect(parseWebSearch('web search x --provider bing')).toEqual({ query: 'x', ...defaults, provider: 'bing' });
  });

  it('parses every flag in any order', () => {
    const expected = { query: 'x', numResults: 5, maxChars: 500, depth: 'advanced', provider: 'tavily' };
    expect(parseWebSearch('web search x --results 5 --max-chars 500 --depth advanced --provider tavily')).toEqual(expected);
    expect(parseWebSearch('web search x --provider tavily --depth advanced --max-chars 500 --results 5')).toEqual(expected);
  });

  it('parses each flag on its own', () => {
    expect(parseWebSearch('web search x --results 5')).toEqual({ query: 'x', ...defaults, numResults: 5 });
    expect(parseWebSearch('web search x --max-chars 500')).toEqual({ query: 'x', ...defaults, maxChars: 500 });
    expect(parseWebSearch('web search x --depth advanced')).toEqual({ query: 'x', ...defaults, depth: 'advanced' });
    expect(parseWebSearch('web search x --provider tinyfish')).toEqual({ query: 'x', ...defaults, provider: 'tinyfish' });
  });

  it('accepts the results range edges and leading zeros', () => {
    expect(parseWebSearch('web search x --results 1')).toEqual({ query: 'x', ...defaults, numResults: 1 });
    expect(parseWebSearch('web search x --results 20')).toEqual({ query: 'x', ...defaults, numResults: 20 });
    expect(parseWebSearch('web search x --results 007')).toEqual({ query: 'x', ...defaults, numResults: 7 });
  });

  it('accepts the character range edges', () => {
    expect(parseWebSearch('web search x --max-chars 200')).toEqual({ query: 'x', ...defaults, maxChars: 200 });
    expect(parseWebSearch('web search x --max-chars 100000')).toEqual({ query: 'x', ...defaults, maxChars: 100_000 });
  });

  it('returns the usage line for results out of range or not whole', () => {
    expect(parseWebSearch('web search x --results 0')).toEqual(usage);
    expect(parseWebSearch('web search x --results 21')).toEqual(usage);
    expect(parseWebSearch('web search x --results 1.5')).toEqual(usage);
    expect(parseWebSearch('web search x --results abc')).toEqual(usage);
    expect(parseWebSearch('web search x --results -3')).toEqual(usage);
  });

  it('returns the usage line for characters out of range or not whole', () => {
    expect(parseWebSearch('web search x --max-chars 199')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars 100001')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars 1.5')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars abc')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars -3')).toEqual(usage);
  });

  it('matches the depth case-insensitively and stores it lowercase', () => {
    expect(parseWebSearch('web search x --depth ADVANCED')).toEqual({ query: 'x', ...defaults, depth: 'advanced' });
    expect(parseWebSearch('web search x --depth Basic')).toEqual({ query: 'x', ...defaults, depth: 'basic' });
  });

  it('returns the usage line for any other depth', () => {
    expect(parseWebSearch('web search x --depth deep')).toEqual(usage);
    expect(parseWebSearch('web search x --depth')).toEqual(usage);
  });

  it('returns the usage line for a missing or unknown command', () => {
    expect(parseWebSearch('web')).toEqual(usage);
    expect(parseWebSearch('web foo')).toEqual(usage);
    expect(parseWebSearch('web search')).toEqual(usage);
    expect(parseWebSearch('web searching x')).toEqual(usage);
    expect(parseWebSearch('file read x')).toEqual(usage);
  });

  it('returns the usage line for an empty query', () => {
    expect(parseWebSearch('web search --results 3')).toEqual(usage);
    expect(parseWebSearch('web search   ')).toEqual(usage);
  });

  it('returns the usage line for an unknown flag', () => {
    expect(parseWebSearch('web search x --Results 3')).toEqual(usage);
    expect(parseWebSearch('web search x --results=5')).toEqual(usage);
    expect(parseWebSearch('web search x --hiden')).toEqual(usage);
    expect(parseWebSearch('web search x --')).toEqual(usage);
  });

  it('returns the usage line for a repeated flag', () => {
    expect(parseWebSearch('web search x --results 1 --results 2')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars 200 --max-chars 300')).toEqual(usage);
    expect(parseWebSearch('web search x --depth basic --depth advanced')).toEqual(usage);
    expect(parseWebSearch('web search x --provider a --provider b')).toEqual(usage);
  });

  it('returns the usage line for a missing flag value', () => {
    expect(parseWebSearch('web search x --results')).toEqual(usage);
    expect(parseWebSearch('web search x --max-chars')).toEqual(usage);
    expect(parseWebSearch('web search x --depth')).toEqual(usage);
    expect(parseWebSearch('web search x --provider')).toEqual(usage);
    expect(parseWebSearch('web search x --provider --results 3')).toEqual(usage);
  });

  it('returns the usage line for a word after the flags', () => {
    expect(parseWebSearch('web search x --results 3 extra')).toEqual(usage);
    expect(parseWebSearch('web search x --results 3 -site:example.com')).toEqual(usage);
  });
});

describe('WEB_SEARCH_USAGE', () => {
  it('is the exact usage line', () => {
    expect(WEB_SEARCH_USAGE).toBe(
      'Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]',
    );
  });

  it('matches the results and character constants', () => {
    expect(WEB_SEARCH_USAGE).toContain(`<${String(WEB_SEARCH_MIN_RESULTS)}-${String(WEB_SEARCH_MAX_RESULTS)}>`);
    expect(WEB_SEARCH_USAGE).toContain(`<${String(WEB_SEARCH_MIN_CHARS)}-${String(WEB_SEARCH_MAX_CHARS)}>`);
  });
});

describe('isWebCommandLine', () => {
  it('claims every line whose first word is web', () => {
    expect(isWebCommandLine('web')).toBe(true);
    expect(isWebCommandLine('Web search x')).toBe(true);
    expect(isWebCommandLine('web foo')).toBe(true);
    expect(isWebCommandLine('web search x')).toBe(true);
  });

  it('rejects lines whose first word merely starts with web', () => {
    expect(isWebCommandLine('webby')).toBe(false);
    expect(isWebCommandLine('websearch')).toBe(false);
    expect(isWebCommandLine('file web')).toBe(false);
  });
});

describe('isWebSearchReplyLine', () => {
  it('recognizes a lowercase web search reply line', () => {
    expect(isWebSearchReplyLine('web search x')).toBe(true);
    expect(isWebSearchReplyLine('web  search x')).toBe(true);
    expect(isWebSearchReplyLine('web search')).toBe(true);
    expect(isWebSearchReplyLine('web\tsearch\tx')).toBe(true);
  });

  it('rejects a sentence or a differently cased reply line', () => {
    expect(isWebSearchReplyLine('Web search found three results.')).toBe(false);
    expect(isWebSearchReplyLine('WEB SEARCH x')).toBe(false);
    expect(isWebSearchReplyLine('web searching')).toBe(false);
    expect(isWebSearchReplyLine('web')).toBe(false);
  });
});

describe('WEB_SEARCH_PRIMER', () => {
  it('is the six primer lines', () => {
    expect(WEB_SEARCH_PRIMER).toBe(
      [
        'To search the web, end your reply with one line:',
        'web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]',
        'The result is a Markdown list of up to 10 results by default, each a title linked to its URL with a snippet beneath. For time-sensitive searches, include the year in the query; the search does not infer freshness.',
        '--depth advanced gives better snippets but costs more; use it only when basic results are not enough.',
        'Search only when the answer needs current or external information; never put file contents or secrets in a query.',
        'Example: web search node.js permission model 2026 --results 5',
      ].join('\n'),
    );
  });

  it('names no four-digit year other than the example', () => {
    expect(WEB_SEARCH_PRIMER.match(/\b\d{4}\b/g)).toEqual(['2026']);
  });
});
