import { describe, expect, it, vi } from 'vitest';
import type { Managers } from './managers.js';
import { LAUNCH_LABEL, openLaunchShell } from './launch-shell.js';

const payload = { instanceKey: 'launch-shell', ptyId: 'pty-1' };

function fakeManagers(options: {
  outcome?: { status: 'ok'; value: undefined } | { status: 'rejected'; reason: string } | { status: 'failed'; error: unknown };
  owner?: string;
  actualPayload?: unknown;
  registeredPty?: string;
  live?: boolean;
  present?: boolean;
} = {}): { managers: Managers; runCommandResult: ReturnType<typeof vi.fn> } {
  const tab = { label: LAUNCH_LABEL, plugin: { id: options.owner ?? 'shell', payload: options.actualPayload ?? payload } };
  const runCommandResult = vi.fn(async () => options.outcome ?? { status: 'ok' as const, value: undefined });
  const isRunningFor = vi.fn(() => options.live ?? true);
  const managers = {
    tab: {
      tabs: options.present === false ? [] : [tab],
      byLabel: (label: string) => options.present === false || label !== LAUNCH_LABEL ? undefined : tab,
    },
    plugins: { runCommandResult, isPayload: (id: string, value: unknown) => id === 'shell' && value === payload },
    pty: {
      terminalIdFor: () => options.registeredPty ?? payload.ptyId,
      isRunningFor,
    },
  } as unknown as Managers;
  return { managers, runCommandResult, isRunningFor };
}

describe('openLaunchShell', () => {
  it('opens and validates the live shell tab through the plugin with a janus launch origin', async () => {
    const { managers, runCommandResult, isRunningFor } = fakeManagers();

    await openLaunchShell(managers);

    expect(runCommandResult).toHaveBeenCalledWith(
      'shell', 'shell --no-workspace', { label: 'janus', command: 'shell --no-workspace', launch: true },
    );
    expect(managers.tab.tabs).toHaveLength(1);
    expect(isRunningFor).toHaveBeenCalledWith('pty-1', ['janus']);
  });

  it.each([
    ['missing launch tab', { present: false }],
    ['wrong plugin owner', { owner: 'other' }],
    ['invalid shell payload', { actualPayload: { ptyId: 'pty-1' } }],
    ['payload and registered PTY mismatch', { registeredPty: 'pty-2' }],
    ['dead terminal', { live: false }],
  ])('rejects a %s even when a tab exists', async (_case, options) => {
    const { managers } = fakeManagers(options);

    await expect(openLaunchShell(managers))
      .rejects.toThrow('could not open the launch shell: the shell plugin opened no valid launch shell');
  });

  it('preserves the shell plugin rejection reason', async () => {
    const { managers } = fakeManagers({ outcome: { status: 'rejected', reason: 'spawn /bin/zsh ENOENT' } });

    await expect(openLaunchShell(managers)).rejects.toThrow('could not open the launch shell: spawn /bin/zsh ENOENT');
  });

  it('preserves the shell plugin failure reason', async () => {
    const error = new Error('activation failed');
    const { managers } = fakeManagers({ outcome: { status: 'failed', error } });

    await expect(openLaunchShell(managers)).rejects.toThrow('could not open the launch shell: activation failed');
  });
});
