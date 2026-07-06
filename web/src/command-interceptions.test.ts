import { describe, it, expect } from 'vitest';
import { resolveSearchInterception } from './command-interceptions';
import type { BufferLine } from '@shared/protocol';

describe('resolveSearchInterception', () => {
  it('returns null when canSearch is false', () => {
    const result = resolveSearchInterception('search transcript hello', false, []);
    expect(result).toBeNull();
  });

  it('returns null when the text does not match the search transcript pattern', () => {
    const result = resolveSearchInterception('some other command', true, []);
    expect(result).toBeNull();
  });

  it('returns the pattern when a matching line is found in the transcript', () => {
    const lines: BufferLine[] = [
      { type: 'output', text: 'hello world' },
    ];
    const result = resolveSearchInterception('search transcript hello', true, lines);
    expect(result).toBe('hello');
  });

  it('returns the whole pattern when it contains spaces', () => {
    const lines: BufferLine[] = [
      { type: 'output', text: 'error: something went wrong' },
    ];
    const result = resolveSearchInterception('search transcript error: something', true, lines);
    expect(result).toBe('error: something');
  });

  it('returns null when the pattern matches no lines', () => {
    const lines: BufferLine[] = [
      { type: 'output', text: 'nothing here' },
    ];
    const result = resolveSearchInterception('search transcript missing', true, lines);
    expect(result).toBeNull();
  });

  it('skips terminal and spacer line types when searching', () => {
    const lines: BufferLine[] = [
      { type: 'terminal', text: 'hello' },
      { type: 'spacer', text: 'hello' },
    ];
    const result = resolveSearchInterception('search transcript hello', true, lines);
    expect(result).toBeNull();
  });
});
