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

  it('reads the shared git-sync clone as $git-sync ahead of $root', () => {
    expect(formatShellCwd('/repo/.janissary/workspace/git-sync', '/repo')).toBe('$git-sync/');
    expect(formatShellCwd('/repo/.janissary/workspace/git-sync/product/plans', '/repo'))
      .toBe('$git-sync/product/plans');
    expect(formatShellCwd('/repo/.janissary/workspace/git-sync-old', '/repo'))
      .toBe('$root/workspace/git-sync-old');
  });

  it('keeps a shell workspaced in its own clone on the workspace shortcut', () => {
    expect(formatShellCwd('/repo/.janissary/workspace/alex', '/repo/.janissary/workspace/alex', '/repo/.janissary/workspace/alex'))
      .toBe('$workspace/alex');
  });

  it('leaves a cwd outside the project unchanged', () => {
    expect(formatShellCwd('/tmp/elsewhere', '/repo')).toBe('/tmp/elsewhere');
  });
});
