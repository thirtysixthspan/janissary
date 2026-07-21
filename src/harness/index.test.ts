import { describe, it, expect } from 'vitest';
import { parseHarnessCommand, HARNESS_NAMES, buildHarnessCommand } from './index.js';

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

  it('recognizes the capture subcommand with a target label', () => {
    const result = parseHarnessCommand('harness capture claude');
    expect('capture' in result && result.capture).toBe(true);
    expect('label' in result && result.label).toBe('claude');
  });

  it('is case-insensitive for the capture keyword but preserves the label case', () => {
    const result = parseHarnessCommand('harness CAPTURE MyTab');
    expect('capture' in result && result.capture).toBe(true);
    expect('label' in result && result.label).toBe('MyTab');
  });

  it('returns a usage error for capture with no label', () => {
    const result = parseHarnessCommand('harness capture');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Usage: harness capture <name>.');
  });

  it('never treats capture as an unknown harness name', () => {
    const result = parseHarnessCommand('harness capture x');
    expect('error' in result).toBe(false);
    expect('name' in result).toBe(false);
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

  it('sets autoApprove true with -y alongside -w', () => {
    const result = parseHarnessCommand('harness claude -w -y');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('sets autoApprove true with --yes in either flag order', () => {
    const result = parseHarnessCommand('harness claude --yes --workspace');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('sets autoApprove false for a plain workspaced launch', () => {
    const result = parseHarnessCommand('harness claude -w');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(false);
  });

  it('sets autoApprove true with -y and no -w', () => {
    const result = parseHarnessCommand('harness claude -y');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(false);
  });

  it('sets autoApprove true with -y for codex', () => {
    const result = parseHarnessCommand('harness codex -y');
    expect('name' in result && result.name).toBe('codex');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('sets autoApprove true with --yes for codex alongside -w', () => {
    const result = parseHarnessCommand('harness codex -w --yes');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('errors when -y is given for an unsupported harness', () => {
    const result = parseHarnessCommand('harness opencode -w -y');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('-y/--yes is only supported for the claude and codex harnesses.');
  });

  it('errors when -y is given for an unsupported harness with no other flags', () => {
    const result = parseHarnessCommand('harness opencode -y');
    expect((result as { error: string }).error).toBe('-y/--yes is only supported for the claude and codex harnesses.');
  });

  it('combines -y with `as <label>` and -w', () => {
    const result = parseHarnessCommand('harness claude as review -w -y');
    expect('label' in result && result.label).toBe('review');
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('does not disturb --offline parsing', () => {
    const result = parseHarnessCommand('harness claude -w -y --offline');
    expect('offline' in result && (result as { offline: boolean }).offline).toBe(true);
    expect('autoApprove' in result && (result as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  it('parses --model <value>', () => {
    const result = parseHarnessCommand('harness opencode --model opencode-go/deepseek-v4-pro');
    expect('model' in result && (result as { model?: string }).model).toBe('opencode-go/deepseek-v4-pro');
  });

  it('parses --effort <value>', () => {
    const result = parseHarnessCommand('harness claude --effort high');
    expect('effort' in result && (result as { effort?: string }).effort).toBe('high');
  });

  it('parses --model and --effort together', () => {
    const result = parseHarnessCommand('harness opencode --model opencode-go/deepseek-v4-pro --effort high');
    expect('model' in result && (result as { model?: string }).model).toBe('opencode-go/deepseek-v4-pro');
    expect('effort' in result && (result as { effort?: string }).effort).toBe('high');
  });

  it('parses --model and --effort in any order relative to other flags', () => {
    const result = parseHarnessCommand('harness opencode -w --effort high as quality --model opencode-go/deepseek-v4-pro');
    expect('model' in result && (result as { model?: string }).model).toBe('opencode-go/deepseek-v4-pro');
    expect('effort' in result && (result as { effort?: string }).effort).toBe('high');
    expect('label' in result && result.label).toBe('quality');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(true);
  });

  it('returns a usage error for --model with no value', () => {
    const result = parseHarnessCommand('harness claude --model');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });

  it('returns a usage error for --effort with no value', () => {
    const result = parseHarnessCommand('harness claude --effort');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });

  it('leaves model and effort undefined when not given', () => {
    const result = parseHarnessCommand('harness claude');
    expect('model' in result && result.model).toBeUndefined();
    expect('effort' in result && result.effort).toBeUndefined();
  });

  it('extracts the prompt after `with`', () => {
    const result = parseHarnessCommand('harness claude with fix the failing tests');
    expect('name' in result && result.name).toBe('claude');
    expect('prompt' in result && result.prompt).toBe('fix the failing tests');
  });

  it('preserves internal spacing in the prompt verbatim', () => {
    const result = parseHarnessCommand('harness claude with add   two  spaces');
    expect('prompt' in result && result.prompt).toBe('add   two  spaces');
  });

  it('combines `with` with `as <label>`, --model, and -w before the clause', () => {
    const result = parseHarnessCommand('harness claude as review -w --model sonnet with ship it now');
    expect('label' in result && result.label).toBe('review');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(true);
    expect('model' in result && (result as { model?: string }).model).toBe('sonnet');
    expect('prompt' in result && result.prompt).toBe('ship it now');
  });

  it('does not scan options that appear inside the prompt', () => {
    const result = parseHarnessCommand('harness claude with add a -w flag as needed');
    expect('workspace' in result && (result as { workspace: boolean }).workspace).toBe(false);
    expect('name' in result && result.label).toBeUndefined();
    expect('prompt' in result && result.prompt).toBe('add a -w flag as needed');
  });

  it('returns a usage error for `with` with no following text', () => {
    const result = parseHarnessCommand('harness claude with');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Usage/i);
  });

  it('leaves prompt undefined when no `with` clause is given', () => {
    const result = parseHarnessCommand('harness claude');
    expect('name' in result && result.prompt).toBeUndefined();
  });

  it('does not match `with` as a substring of another word', () => {
    const result = parseHarnessCommand('harness claude as within');
    expect('label' in result && result.label).toBe('within');
    expect('name' in result && result.prompt).toBeUndefined();
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

  it('appends claude\'s --effort flag when given, with no model', () => {
    expect(buildHarnessCommand('claude', undefined, 'high')).toBe("claude --effort 'high'");
  });

  it('translates effort to codex\'s reasoning-effort config override', () => {
    expect(buildHarnessCommand('codex', undefined, 'high')).toBe("codex -c 'model_reasoning_effort=high'");
  });

  it('appends both --model and codex\'s effort override when both are given', () => {
    expect(buildHarnessCommand('codex', 'gpt-5', 'high')).toBe(
      "codex --model 'gpt-5' -c 'model_reasoning_effort=high'",
    );
  });

  it('drops effort for opencode, which has no effort flag, keeping the model', () => {
    expect(buildHarnessCommand('opencode', 'opencode-go/deepseek-v4-pro', 'high')).toBe(
      "opencode --model 'opencode-go/deepseek-v4-pro'",
    );
  });
});
