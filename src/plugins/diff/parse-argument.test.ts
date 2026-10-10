import { describe, expect, it } from 'vitest';
import { DIFF_USAGE, parseDiffArgument } from './parse-argument.js';

describe('parseDiffArgument', () => {
  it('reads a bare command as the project root with no clause', () => {
    expect(parseDiffArgument('')).toEqual({ path: '' });
    expect(parseDiffArgument(' '.repeat(3))).toEqual({ path: '' });
  });

  it('keeps the remaining words as the path', () => {
    expect(parseDiffArgument('src')).toEqual({ path: 'src' });
    expect(parseDiffArgument('src/nested')).toEqual({ path: 'src/nested' });
  });

  it('lifts the token after a case-insensitive on as the tab name', () => {
    expect(parseDiffArgument('on ahmed')).toEqual({ path: '', tab: 'ahmed' });
    expect(parseDiffArgument('ON Ahmed')).toEqual({ path: '', tab: 'Ahmed' });
    expect(parseDiffArgument('on ahmed-2')).toEqual({ path: '', tab: 'ahmed-2' });
  });

  it('refuses a path and a clause together, whichever comes first', () => {
    expect(parseDiffArgument('src on ahmed')).toEqual({ error: DIFF_USAGE });
    expect(parseDiffArgument('on ahmed src')).toEqual({ error: DIFF_USAGE });
  });

  it('refuses an on with no token after it', () => {
    expect(parseDiffArgument('on')).toEqual({ error: DIFF_USAGE });
    expect(parseDiffArgument('  on  ')).toEqual({ error: DIFF_USAGE });
  });

  it('answers the usage line naming both forms', () => {
    expect(parseDiffArgument('on').error).toBe('Usage: diff [path] [on <tab name>]');
  });

  it('takes a tab literally named on', () => {
    expect(parseDiffArgument('on on')).toEqual({ path: '', tab: 'on' });
  });
});
