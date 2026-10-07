import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import { ZshStartupDirectory } from '../shell/zsh-startup/directory.js';
import { shellSetupScript } from '../shell/zsh-startup/script.js';
import { ownsTerminal, spawnPluginTerminal } from './plugin-terminals.js';

const NONCE = 'ab'.repeat(16);

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
  let parent: string;
  let startup: ZshStartupDirectory;

  beforeEach(() => {
    parent = mkdtempSync(path.join(tmpdir(), 'plugin-terminals-test-'));
    startup = new ZshStartupDirectory(parent);
  });

  afterEach(() => {
    startup.dispose();
    rmSync(parent, { recursive: true, force: true });
  });

  const manager = () => {
    const spawn = vi.fn(() => 'pty-9');
    const fake = {
      spawn,
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      isRunning: () => true,
    } as unknown as PseudoterminalManager;
    return { fake, spawn };
  };

  const spawnedEnv = (spawn: ReturnType<typeof manager>['spawn'], call = 0): Record<string, string> | undefined =>
    (spawn.mock.calls[call] as unknown[] | undefined)?.[6] as Record<string, string> | undefined;

  it('adds the plugin\'s environment over the terminal\'s own', () => {
    const { fake, spawn } = manager();
    spawnPluginTerminal(fake, '/repo', { cwd: '/repo', shell: '/bin/zsh', args: [], env: { ZDOTDIR: '/tmp/z' } }, startup);
    expect(spawn).toHaveBeenCalledWith(
      '', 'zsh', '', '/repo', undefined, undefined, { ZDOTDIR: '/tmp/z' }, { shell: '/bin/zsh', args: [] },
    );
  });

  it('adds nothing when the plugin names no environment', () => {
    const { fake, spawn } = manager();
    spawnPluginTerminal(fake, '/repo', { cwd: '/repo', shell: '/bin/zsh', args: [] }, startup);
    expect(spawnedEnv(spawn)).toBeUndefined();
    expect(readdirSync(parent)).toEqual([]);
  });

  it('builds the zsh startup environment over the plugin\'s own when it asks for zsh hooks', () => {
    const { fake, spawn } = manager();
    spawnPluginTerminal(fake, '/repo', {
      cwd: '/repo', shell: '/bin/zsh', args: [], env: { EXTRA: '1' }, zshHooks: { nonce: NONCE },
    }, startup);
    const env = spawnedEnv(spawn);
    expect(env).toMatchObject({ EXTRA: '1', JANUS_SHELL_SETUP: shellSetupScript(NONCE) });
    expect(env?.ZDOTDIR).toBe(startup.path());
    expect(existsSync(path.join(env?.ZDOTDIR ?? '', '.zshrc'))).toBe(true);
  });

  it('creates the startup directory once across spawns and removes it on dispose', () => {
    const { fake, spawn } = manager();
    const options = { cwd: '/repo', shell: '/bin/zsh', args: [], zshHooks: { nonce: NONCE } };
    spawnPluginTerminal(fake, '/repo', options, startup);
    spawnPluginTerminal(fake, '/repo', options, startup);
    const directory = spawnedEnv(spawn, 0)?.ZDOTDIR ?? '';
    expect(spawnedEnv(spawn, 1)?.ZDOTDIR).toBe(directory);
    expect(readdirSync(parent)).toHaveLength(1);

    startup.dispose();

    expect(existsSync(directory)).toBe(false);
  });

  it('refuses a zsh hooks nonce of any other shape before starting anything', () => {
    const { fake, spawn } = manager();
    expect(() => spawnPluginTerminal(fake, '/repo', {
      cwd: '/repo', shell: '/bin/zsh', args: [], zshHooks: { nonce: "'; rm -rf ~; '" },
    }, startup)).toThrow(TabPluginRejection);
    expect(spawn).not.toHaveBeenCalled();
    expect(readdirSync(parent)).toEqual([]);
  });
});
