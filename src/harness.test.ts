import { describe, it, expect } from 'vitest';
import { parseHarnessCommand, HARNESS_NAMES } from './harness.js';

describe('parseHarnessCommand', () => {
  it('accepts valid harness names', () => {
    for (const name of HARNESS_NAMES) {
      const result = parseHarnessCommand(`harness ${name}`);
      expect('name' in result && result.name).toBe(name);
    }
  });

  it('is case-insensitive for the harness name', () => {
    const result = parseHarnessCommand('harness CLAUDE');
    expect('name' in result && result.name).toBe('claude');
  });

  it('returns an error for a missing name', () => {
    const result = parseHarnessCommand('harness');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });

  it('returns an error for an unknown harness name', () => {
    const result = parseHarnessCommand('harness gemini');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Unknown harness/);
    expect((result as { error: string }).error).toMatch('gemini');
  });

  it('ignores extra arguments after the name', () => {
    const result = parseHarnessCommand('harness claude --some-flag');
    expect('name' in result && result.name).toBe('claude');
  });
});
