import { describe, it, expect } from 'vitest';
import { parseHarnessCommand, HARNESS_NAMES, buildHarnessCommand } from './harness.js';

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

  it('sets offline true with --offline flag', () => {
    const result = parseHarnessCommand('harness claude -w --offline');
    expect('offline' in result && (result as { offline: boolean }).offline).toBe(true);
  });

  it('sets offline false when no flag is given', () => {
    const result = parseHarnessCommand('harness claude');
    expect('offline' in result && (result as { offline: boolean }).offline).toBe(false);
  });

  it('sets a custom label with `as <label>`', () => {
    const result = parseHarnessCommand('harness opencode as quality');
    expect('name' in result && result.name).toBe('opencode');
    expect('label' in result && result.label).toBe('quality');
  });

  it('leaves label undefined when `as` is not given', () => {
    const result = parseHarnessCommand('harness claude');
    expect('name' in result && result.label).toBeUndefined();
  });

  it('combines `as <label>` with `-w`', () => {
    const result = parseHarnessCommand('harness opencode as quality -w');
    expect('label' in result && result.label).toBe('quality');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(true);
  });

  it('returns an error when `as` has no label', () => {
    const result = parseHarnessCommand('harness claude as');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });
});

describe('buildHarnessCommand', () => {
  it('returns just the binary when no model is given', () => {
    expect(buildHarnessCommand('opencode')).toBe('opencode');
  });

  it('appends a quoted --model flag when a model is given', () => {
    expect(buildHarnessCommand('opencode', 'opencode-go/deepseek-v4-pro')).toBe("opencode --model 'opencode-go/deepseek-v4-pro'");
  });

  it('safely quotes a model value containing a single quote', () => {
    expect(buildHarnessCommand('opencode', "a'b")).toBe(String.raw`opencode --model 'a'\''b'`);
  });
});
