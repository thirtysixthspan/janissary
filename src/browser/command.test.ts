import { describe, it, expect } from 'vitest';
import { parseBrowserCommand, extractBrowserCommand } from './command.js';

describe('parseBrowserCommand', () => {
  it('parses open with an optional name and headless default', () => {
    expect(parseBrowserCommand('browser open')).toEqual({ action: 'open', name: undefined, headed: false });
    expect(parseBrowserCommand('browser open main')).toEqual({ action: 'open', name: 'main', headed: false });
  });

  it('parses the --headed / -H flag in any position', () => {
    expect(parseBrowserCommand('browser open --headed')).toEqual({ action: 'open', name: undefined, headed: true });
    expect(parseBrowserCommand('browser open main --headed')).toEqual({ action: 'open', name: 'main', headed: true });
    expect(parseBrowserCommand('browser open -H main')).toEqual({ action: 'open', name: 'main', headed: true });
  });

  it('parses list / use / close / window close', () => {
    expect(parseBrowserCommand('browser list')).toEqual({ action: 'list' });
    expect(parseBrowserCommand('browser use w2')).toEqual({ action: 'use', id: 'w2' });
    expect(parseBrowserCommand('browser close')).toEqual({ action: 'close' });
    expect(parseBrowserCommand('browser window close w3')).toEqual({ action: 'closeWindow', id: 'w3' });
  });

  it('treats `browser close <id>` as an alias for `browser window close <id>`', () => {
    expect(parseBrowserCommand('browser close w2')).toEqual({ action: 'closeWindow', id: 'w2' });
  });

  it('parses goto / eval / content / shot, preserving argument text', () => {
    expect(parseBrowserCommand('browser goto https://example.com/a b')).toEqual({
      action: 'goto',
      url: 'https://example.com/a b',
    });
    expect(parseBrowserCommand('browser eval document.title')).toEqual({ action: 'eval', js: 'document.title' });
    expect(parseBrowserCommand('browser content')).toEqual({ action: 'content' });
    expect(parseBrowserCommand('browser shot')).toEqual({ action: 'shot' });
  });

  it('is case-insensitive on the command keyword', () => {
    expect(parseBrowserCommand('BROWSER list')).toEqual({ action: 'list' });
  });

  it('returns a usage error for empty, unknown, or malformed input', () => {
    expect('error' in parseBrowserCommand('browser')).toBe(true);
    expect('error' in parseBrowserCommand('browser frobnicate')).toBe(true);
    expect('error' in parseBrowserCommand('browser goto')).toBe(true);
    expect('error' in parseBrowserCommand('browser use')).toBe(true);
    expect('error' in parseBrowserCommand('browser window open w1')).toBe(true);
  });
});

describe('extractBrowserCommand', () => {
  it('finds a trailing browser command, ignoring prose', () => {
    expect(extractBrowserCommand('Let me fetch that.\nbrowser goto https://example.com')).toBe(
      'browser goto https://example.com',
    );
  });

  it('tolerates a code fence and prompt markers', () => {
    expect(extractBrowserCommand('Sure:\n```\n$ browser content\n```')).toBe('browser content');
  });

  it('returns null when there is no browser command', () => {
    expect(extractBrowserCommand('Here is the summary of the page.')).toBeNull();
    expect(extractBrowserCommand('db sqlite list')).toBeNull();
  });
});
