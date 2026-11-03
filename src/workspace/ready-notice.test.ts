import { describe, it, expect } from 'vitest';
import { formatPrepareDuration, workspaceReadyMessage } from './ready-notice.js';

describe('formatPrepareDuration', () => {
  it.each([
    [0, '0.0s'],
    [840, '0.8s'],
    [12_340, '12.3s'],
    [59_940, '59.9s'],
    [59_960, '1m 00s'],
    [65_000, '1m 05s'],
    [3_725_000, '62m 05s'],
  ])('renders %d ms as %s', (milliseconds, text) => {
    expect(formatPrepareDuration(milliseconds)).toBe(text);
  });
});

describe('workspaceReadyMessage', () => {
  it('names the clone by its abbreviated directory and the time taken', () => {
    expect(workspaceReadyMessage('/repo/.janissary/workspace/claude', 4210))
      .toBe('Prepared workspace $workspace/claude in 4.2s.');
  });
});
