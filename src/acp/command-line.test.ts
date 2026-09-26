import { describe, it, expect } from 'vitest';
import { cleanCommandLine, findLastCommandLine } from './command-line.js';

const isDb = (line: string) => line.startsWith('db ');

describe('cleanCommandLine', () => {
  it('strips a leading prompt marker and surrounding whitespace', () => {
    expect(cleanCommandLine('  $ db sqlite list  ')).toBe('db sqlite list');
    expect(cleanCommandLine('> db sqlite list')).toBe('db sqlite list');
  });

  it('strips inline backticks on both ends', () => {
    expect(cleanCommandLine('`db sqlite delete shop`')).toBe('db sqlite delete shop');
  });

  it('leaves a plain line untouched', () => {
    expect(cleanCommandLine('Here is the answer.')).toBe('Here is the answer.');
  });
});

describe('findLastCommandLine', () => {
  it('returns the bottom-most line that passes the test', () => {
    expect(findLastCommandLine('db one\ntext\ndb two\nmore text', isDb)).toBe('db two');
  });

  it('returns null when no line passes', () => {
    expect(findLastCommandLine('just an answer\nwith two lines', isDb)).toBeNull();
  });

  it('tests the cleaned line rather than the raw one', () => {
    expect(findLastCommandLine('Run this:\n```\n$ db sqlite list\n```', isDb)).toBe('db sqlite list');
  });
});
