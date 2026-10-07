import { describe, expect, it, vi } from 'vitest';
import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import { spawnRemotePluginTerminal } from './remote-plugin-terminal.js';

describe('spawnRemotePluginTerminal', () => {
  it('registers a labelled remote shell with cwd, offline mode, and zsh hooks without a local root check', () => {
    const registerRemotePty = vi.fn(() => 'remote-pty-1');
    const pty = {
      registerRemotePty,
      spawnDimensions: () => ({ cols: 100, rows: 40 }),
      isRunning: () => true,
    } as unknown as PseudoterminalManager;

    const terminal = spawnRemotePluginTerminal(
      pty, 'remote-shell', {} as RemoteChannel,
      {
        cwd: '/far-side/workspace/src', shell: '/bin/zsh', args: ['-f'], env: { PLUGIN_SETTING: 'on' },
        workspace: { dir: '/far-side/workspace', offline: true }, zshHooks: { nonce: 'a'.repeat(32) },
      },
    );

    expect(registerRemotePty).toHaveBeenCalledWith('remote-shell', expect.anything(), {
      program: 'zsh', command: 'zsh', cwd: '/far-side/workspace/src', offline: true, shell: { nonce: 'a'.repeat(32) },
      launch: { shell: '/bin/zsh', args: ['-f'] }, env: { PLUGIN_SETTING: 'on' },
    });
    expect(terminal).toEqual({ ptyId: 'remote-pty-1', cols: 100, rows: 40, running: true });
  });

  it('rejects an invalid hooks nonce before registering a remote process', () => {
    const registerRemotePty = vi.fn();
    const pty = { registerRemotePty } as unknown as PseudoterminalManager;

    expect(() => spawnRemotePluginTerminal(
      pty, 'remote-shell', {} as RemoteChannel,
      { cwd: '/far-side/workspace', zshHooks: { nonce: 'bad' } },
    )).toThrow(TabPluginRejection);
    expect(registerRemotePty).not.toHaveBeenCalled();
  });
});
