import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { typeIntoHarness } from './input.js';

describe('typeIntoHarness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fakePty(): { pty: { input: ReturnType<typeof vi.fn> }; input: ReturnType<typeof vi.fn> } {
    const input = vi.fn();
    return { pty: { input }, input };
  }

  it('frames the text as a bracketed paste for a harness that classifies burst input as paste', () => {
    const { pty, input } = fakePty();
    typeIntoHarness(pty, 'p1', 'codex', 'fix the tests');
    expect(input).toHaveBeenCalledWith('p1', '\u{1B}[200~fix the tests\u{1B}[201~');
    expect(input).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenCalledWith('p1', '\r');
  });

  it('writes the text plain for every other harness view target', () => {
    for (const name of ['claude', 'opencode', 'ssh']) {
      const { pty, input } = fakePty();
      typeIntoHarness(pty, 'p1', name, 'fix the tests');
      expect(input).toHaveBeenCalledWith('p1', 'fix the tests');
      expect(input).not.toHaveBeenCalledWith('p1', expect.stringContaining('\u{1B}[200~'));
      vi.advanceTimersByTime(50);
      expect(input).toHaveBeenCalledWith('p1', '\r');
    }
  });
});
