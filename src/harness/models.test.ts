import { describe, it, expect } from 'vitest';
import { modelsFor, isKnownModel } from './models.js';

describe('harness-models', () => {
  it('returns the catalog for a known harness', () => {
    expect(modelsFor('opencode')).toContain('opencode-go/deepseek-v4-pro');
  });

  it('returns an empty list for an unknown harness', () => {
    expect(modelsFor('mystery')).toEqual([]);
  });

  it('accepts a known model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/deepseek-v4-pro')).toBe(true);
  });

  it('rejects an unknown model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/nonexistent')).toBe(false);
  });

  it('rejects an unknown harness', () => {
    expect(isKnownModel('mystery', 'opencode-go/deepseek-v4-pro')).toBe(false);
  });

  it('returns the catalog for the claude harness', () => {
    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it('accepts a known claude model id', () => {
    expect(isKnownModel('claude', 'claude-sonnet-5')).toBe(true);
  });

  it('rejects an unknown claude model id', () => {
    expect(isKnownModel('claude', 'not-a-real-model')).toBe(false);
  });

  it('returns the catalog for the codex harness', () => {
    expect(modelsFor('codex')).toContain('gpt-5.5');
  });

  it('accepts a known codex model id', () => {
    expect(isKnownModel('codex', 'gpt-5.5')).toBe(true);
  });

  it('rejects an unknown codex model id', () => {
    expect(isKnownModel('codex', 'not-a-real-model')).toBe(false);
  });
});
