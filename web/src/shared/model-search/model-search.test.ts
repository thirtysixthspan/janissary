import { describe, it, expect } from 'vitest';
import { completeModel, mostUsedModels } from './model-search';

describe('completeModel', () => {
  it('returns the full id for a single match', () => {
    expect(completeModel(['opus', 'sonnet'], 'opu')).toBe('opus');
  });

  it('uses every match, not just the first ten, when computing the prefix', () => {
    const ids = [
      ...Array.from({ length: 10 }, (_, i) => `model-aa-${String(i).padStart(2, '0')}`),
      'model-aaaa-11',
    ];
    expect(completeModel(ids, 'model-')).toBe('model-aa');
  });

  it('returns null when the prefix does not contain the typed text', () => {
    expect(completeModel(['claude-opus-5-5', 'claude-sonnet-5-5'], '5')).toBeNull();
  });

  it('returns null when the prefix is no longer than the trimmed text', () => {
    expect(completeModel(['claude-a', 'claude-b'], 'CLAUDE-')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(completeModel(['opus', 'sonnet'], 'zzz')).toBeNull();
  });

  it('returns null for blank and whitespace-only text', () => {
    expect(completeModel(['opus'], '')).toBeNull();
    expect(completeModel(['opus'], ' '.repeat(3))).toBeNull();
  });

  it('returns null when the result equals the current text', () => {
    expect(completeModel(['opus'], 'opus')).toBeNull();
  });

  it('completes untrimmed text whose trimmed form is the single match', () => {
    expect(completeModel(['opus'], ' opus')).toBe('opus');
  });
});

describe('mostUsedModels', () => {
  it('counts roles, not entries within a role', () => {
    const roles = [
      [{ harness: 'claude', model: 'sonnet' }],
      [{ harness: 'claude', model: 'opus' }, { harness: 'claude', model: 'opus' }],
    ];
    expect(mostUsedModels(roles, 'claude', ['opus', 'sonnet'])).toEqual(['sonnet', 'opus']);
  });

  it('ranks higher usage first even when that model appears later', () => {
    const roles = [
      [{ harness: 'claude', model: 'haiku' }],
      [{ harness: 'claude', model: 'opus' }],
      [{ harness: 'claude', model: 'opus' }],
    ];
    expect(mostUsedModels(roles, 'claude', ['haiku', 'opus'])).toEqual(['opus', 'haiku']);
  });

  it('keeps first-appearance order on a tie', () => {
    const roles = [
      [{ harness: 'claude', model: 'sonnet' }, { harness: 'claude', model: 'opus' }],
      [{ harness: 'claude', model: 'opus' }, { harness: 'claude', model: 'sonnet' }],
    ];
    expect(mostUsedModels(roles, 'claude', ['opus', 'sonnet'])).toEqual(['sonnet', 'opus']);
  });

  it('only returns ids present in the enabled list', () => {
    const roles = [[
      { harness: 'claude', model: 'opus' },
      { harness: 'claude', model: 'disabled' },
      { harness: 'claude', model: 'unknown' },
    ]];
    expect(mostUsedModels(roles, 'claude', ['opus'])).toEqual(['opus']);
  });

  it('ignores entries for other harnesses', () => {
    const roles = [[
      { harness: 'codex', model: 'gpt' },
      { harness: 'claude', model: 'opus' },
    ]];
    expect(mostUsedModels(roles, 'claude', ['gpt', 'opus'])).toEqual(['opus']);
  });

  it('excludes unused models and returns an empty result when none are used', () => {
    expect(mostUsedModels([[{ harness: 'claude', model: 'opus' }]], 'claude', ['sonnet'])).toEqual([]);
    expect(mostUsedModels([], 'claude', ['opus'])).toEqual([]);
  });

  it('returns at most ten models', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `model-${i}`);
    const roles = [ids.map((model) => ({ harness: 'claude', model }))];
    expect(mostUsedModels(roles, 'claude', ids)).toEqual(ids.slice(0, 10));
  });
});
