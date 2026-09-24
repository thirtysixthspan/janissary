import { describe, it, expect } from 'vitest';
import { workspaceLabelError } from './label.js';

describe('workspaceLabelError', () => {
  it.each(['claude', 'claude-2', 'bekir', 'my.agent', 'foo..bar'])('accepts %j', (label) => {
    expect(workspaceLabelError(label)).toBeUndefined();
  });

  it.each(['', '.', '..', '../victim', 'a/b', '/abs', String.raw`a\b`, String.raw`..\victim`,'a\0b'])('refuses %j', (label) => {
    expect(workspaceLabelError(label)).toMatch(/single folder name/);
  });
});
