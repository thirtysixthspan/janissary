import { describe, expect, it, vi } from 'vitest';
import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { ownsTerminal, spawnPluginTerminal } from './plugin-terminals.js';

const pty = (terminals: Record<string, string>) => ({
  terminalIdFor: (label: string): string | undefined => terminals[label],
});

describe('ownsTerminal', () => {
  it('accepts a plugin tab whose label has a terminal', () => {
    expect(ownsTerminal({ label: 'shell', view: 'plugin' }, pty({ shell: 'pty-1' }))).toBe(true);
  });

  it('refuses a plugin tab without a terminal', () => {
    expect(ownsTerminal({ label: 'viewer', view: 'plugin' }, pty({ shell: 'pty-1' }))).toBe(false);
  });

  it('refuses a tab that is not a plugin tab even when a terminal is registered under its label', () => {
    expect(ownsTerminal({ label: 'janus', view: 'agent' }, pty({ janus: 'pty-2' }))).toBe(false);
    expect(ownsTerminal({ label: 'codex', view: 'harness' }, pty({ codex: 'pty-3' }))).toBe(false);
  });
});

describe('spawnPluginTerminal', () => {
  const manager = () => {
    const spawn = vi.fn(() => 'pty-9');
    const fake = {
      spawn,
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      isRunning: () => true,
    } as unknown as PseudoterminalManager;
    return { fake, spawn };
  };

  it('adds the plugin\'s environment over the terminal\'s own', () => {
    const { fake, spawn } = manager();
    spawnPluginTerminal(fake, '/repo', { cwd: '/repo', shell: '/bin/zsh', args: [], env: { ZDOTDIR: '/tmp/z' } });
    expect(spawn).toHaveBeenCalledWith(
      '', 'zsh', '', '/repo', undefined, undefined, { ZDOTDIR: '/tmp/z' }, { shell: '/bin/zsh', args: [] },
    );
  });

  it('adds nothing when the plugin names no environment', () => {
    const { fake, spawn } = manager();
    spawnPluginTerminal(fake, '/repo', { cwd: '/repo', shell: '/bin/zsh', args: [] });
    expect(spawn.mock.calls[0]?.[6]).toBeUndefined();
  });
});
