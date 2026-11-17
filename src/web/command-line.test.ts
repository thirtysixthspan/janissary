import { describe, expect, it } from 'vitest';
import { isWebCommandLine, WEB_USAGE, webSubcommand } from './command-line.js';
import { WEB_FETCH_USAGE } from './fetch/command.js';
import { WEB_SEARCH_USAGE } from './search/command.js';

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

describe('webSubcommand', () => {
  it('returns undefined for a bare web line', () => {
    expect(webSubcommand('web')).toBeUndefined();
  });

  it('returns search for a web search line', () => {
    expect(webSubcommand('web search x')).toBe('search');
  });

  it('returns fetch for a mixed-case web fetch line', () => {
    expect(webSubcommand('WEB Fetch x')).toBe('fetch');
  });

  it('returns undefined for an unknown or longer second word', () => {
    expect(webSubcommand('web foo')).toBeUndefined();
    expect(webSubcommand('web searching x')).toBeUndefined();
  });

  it('ignores extra whitespace', () => {
    expect(webSubcommand('  web   search  x')).toBe('search');
  });
});

describe('WEB_USAGE', () => {
  it('joins the search and fetch usage lines with one newline, search first', () => {
    expect(WEB_USAGE).toBe(`${WEB_SEARCH_USAGE}\n${WEB_FETCH_USAGE}`);
  });
});
