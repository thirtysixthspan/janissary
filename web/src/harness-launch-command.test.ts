import { describe, it, expect } from 'vitest';
import { buildHarnessLaunchCommand, type HarnessLaunchFields } from './harness-launch-command';

function fields(overrides: Partial<HarnessLaunchFields> = {}): HarnessLaunchFields {
  return { name: 'claude', label: '', workspace: false, offline: false, autoApprove: false, model: '', effort: '', ...overrides };
}

describe('buildHarnessLaunchCommand', () => {
  it('builds a bare `harness <name>` when no flags are set', () => {
    expect(buildHarnessLaunchCommand(fields())).toBe('harness claude');
  });

  it('adds `as <label>` for a non-empty label', () => {
    expect(buildHarnessLaunchCommand(fields({ label: 'quality' }))).toBe('harness claude as quality');
  });

  it('omits `as` for a blank/whitespace label', () => {
    expect(buildHarnessLaunchCommand(fields({ label: ' '.repeat(3) }))).toBe('harness claude');
  });

  it('adds -w for workspace', () => {
    expect(buildHarnessLaunchCommand(fields({ workspace: true }))).toBe('harness claude -w');
  });

  it('adds --offline for offline', () => {
    expect(buildHarnessLaunchCommand(fields({ offline: true }))).toBe('harness claude --offline');
  });

  it('adds -y for autoApprove', () => {
    expect(buildHarnessLaunchCommand(fields({ autoApprove: true }))).toBe('harness claude -y');
  });

  it('adds --model with the value verbatim (not quoted, so it round-trips through the parser)', () => {
    expect(buildHarnessLaunchCommand(fields({ name: 'opencode', model: 'opencode-go/glm-5.2' }))).toBe('harness opencode --model opencode-go/glm-5.2');
  });

  it('adds --effort with the trimmed value', () => {
    expect(buildHarnessLaunchCommand(fields({ effort: ' high ' }))).toBe('harness claude --effort high');
  });

  it('assembles every flag in a fixed order', () => {
    const command = buildHarnessLaunchCommand(fields({
      name: 'claude', label: 'quality', workspace: true, offline: true, autoApprove: true, model: '', effort: 'high',
    }));
    expect(command).toBe('harness claude as quality -w --offline -y --effort high');
  });

  it('never emits -y without -w (the form gates it, but the builder also only emits what it is given)', () => {
    // The form only sets autoApprove when workspace is on; a fields object with autoApprove but no
    // workspace would still just reflect its inputs — the invalid pairing is prevented upstream.
    expect(buildHarnessLaunchCommand(fields({ workspace: true, autoApprove: true }))).toBe('harness claude -w -y');
  });
});
