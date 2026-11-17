import { describe, expect, it } from 'vitest';
import { isWebCommandLine } from './command-line.js';

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
