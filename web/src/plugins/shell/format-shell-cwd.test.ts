import { describe, expect, it } from 'vitest';
import { formatShellCwd } from './format-shell-cwd';

describe('formatShellCwd', () => {
  it('shortens the project root and paths below it', () => {
    expect(formatShellCwd('/repo', '/repo')).toBe('$root/');
    expect(formatShellCwd('/repo/src', '/repo')).toBe('$root/src');
  });

  it('folds the hidden state directory into the root shortcut', () => {
    expect(formatShellCwd('/repo/.janissary/workspace/alex', '/repo'))
      .toBe('$root/workspace/alex');
    expect(formatShellCwd('/repo/.janissary', '/repo')).toBe('$root/');
  });

  it('uses the workspace shortcut for the clone and descendants only', () => {
    expect(formatShellCwd('/repo/.janissary/workspace/alex/src', '/repo', '/repo/.janissary/workspace/alex'))
      .toBe('$workspace/alex/src');
    expect(formatShellCwd('/repo/.janissary/workspace/alex-old', '/repo', '/repo/.janissary/workspace/alex'))
      .toBe('$root/workspace/alex-old');
  });

  it('leaves a cwd outside the project unchanged', () => {
    expect(formatShellCwd('/tmp/elsewhere', '/repo')).toBe('/tmp/elsewhere');
  });
});
