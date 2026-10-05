import { describe, expect, it } from 'vitest';
import { appendShellHistory } from './shell-history';

describe('appendShellHistory', () => {
  it('appends a line without its surrounding whitespace', () => {
    expect(appendShellHistory(['pwd'], '  ls -la \n')).toEqual(['pwd', 'ls -la']);
  });

  it('keeps the inner lines of a multi-line command', () => {
    expect(appendShellHistory([], 'for f in *; do\n  echo $f\ndone')).toEqual(['for f in *; do\n  echo $f\ndone']);
  });

  it('leaves the history untouched for an empty or whitespace-only line', () => {
    const history = ['pwd'];
    expect(appendShellHistory(history, '')).toBe(history);
    expect(appendShellHistory(history, ' \t ')).toBe(history);
    expect(appendShellHistory(history, '\n\n')).toBe(history);
  });
});
