import { describe, it, expect } from 'vitest';
import { isInteractive } from './interactive.js';

describe('isInteractive', () => {
  it('detects pagers and editors', () => {
    expect(isInteractive('less file.txt')).toBe(true);
    expect(isInteractive('vim src/cli.tsx')).toBe(true);
    expect(isInteractive('top')).toBe(true);
    expect(isInteractive('man ls')).toBe(true);
  });

  it('detects an interactive program at the end of a pipeline', () => {
    expect(isInteractive('git log | less')).toBe(true);
    expect(isInteractive('ps aux | less -S')).toBe(true);
  });

  it('looks through wrapper commands and env assignments', () => {
    expect(isInteractive('sudo vim /etc/hosts')).toBe(true);
    expect(isInteractive('PAGER=less less notes.md')).toBe(true);
    expect(isInteractive('env EDITOR=vi vim x')).toBe(true);
  });

  it('resolves the program basename from a path', () => {
    expect(isInteractive('/usr/bin/less file')).toBe(true);
  });

  it('returns false for non-interactive commands', () => {
    expect(isInteractive('ls -la')).toBe(false);
    expect(isInteractive('echo hello')).toBe(false);
    expect(isInteractive('cat file.txt')).toBe(false);
    expect(isInteractive('grep less file')).toBe(false); // less is an argument, not the program
  });

  it('handles empty input', () => {
    expect(isInteractive('')).toBe(false);
    expect(isInteractive(' '.repeat(3))).toBe(false);
  });
});
