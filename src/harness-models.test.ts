import { describe, it, expect } from 'vitest';
import { modelsFor, isKnownModel } from './harness-models.js';

describe('harness-models', () => {
  it('returns the catalog for a known harness', () => {
    expect(modelsFor('opencode')).toContain('opencode-go/deepseek-v4-pro');
  });

  it('returns an empty list for an unknown harness', () => {
    expect(modelsFor('claude')).toEqual([]);
  });

  it('accepts a known model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/deepseek-v4-pro')).toBe(true);
  });

  it('rejects an unknown model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/nonexistent')).toBe(false);
  });

  it('rejects an unknown harness', () => {
    expect(isKnownModel('claude', 'opencode-go/deepseek-v4-pro')).toBe(false);
  });
});
