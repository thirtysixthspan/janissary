import { describe, expect, it } from 'vitest';
import { focusedMainAreaLabel } from './focus.js';

describe('focusedMainAreaLabel', () => {
  it('chooses the lowest-numbered focused candidate across entry kinds', () => {
    expect(focusedMainAreaLabel([
      { label: 'agent', number: 3, focus: true },
      { label: 'harness', number: 2, focus: true },
      { label: 'editor', number: 1, focus: true },
    ], 'agent')).toBe('editor');
  });

  it('falls back to the first new label when no candidate claims focus', () => {
    expect(focusedMainAreaLabel([{ label: 'agent', number: 1 }], 'agent')).toBe('agent');
  });

  it('returns the single focused candidate', () => {
    expect(focusedMainAreaLabel([{ label: 'editor', focus: true }], 'agent')).toBe('editor');
  });

  it('handles an empty candidate list', () => {
    expect(focusedMainAreaLabel([], undefined)).toBeUndefined();
  });
});
