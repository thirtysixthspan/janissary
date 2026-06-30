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

  it('ignores unrecognized extra arguments after the name', () => {
    const result = parseHarnessCommand('harness claude --some-flag');
    expect('name' in result && result.name).toBe('claude');
  });

  it('sets workspace true with -w flag', () => {
    const result = parseHarnessCommand('harness claude -w');
    expect('name' in result && result.name).toBe('claude');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(true);
  });

  it('sets workspace true with --workspace flag', () => {
    const result = parseHarnessCommand('harness claude --workspace');
    expect('name' in result && result.name).toBe('claude');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(true);
  });

  it('sets workspace false when no flag is given', () => {
    const result = parseHarnessCommand('harness claude');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(false);
  });
});
