import { describe, expect, it, vi } from 'vitest';
import type { Managers } from './managers.js';
import { LAUNCH_LABEL, openLaunchShell } from './launch-shell.js';

function fakeManagers(opens: boolean, reason?: string): { managers: Managers; runCommand: ReturnType<typeof vi.fn> } {
  const tabs: { label: string }[] = [];
  const runCommand = vi.fn(async () => { if (opens) tabs.push({ label: LAUNCH_LABEL }); });
  const managers = {
    tab: { tabs },
    plugins: { runCommand, statusFor: () => (reason === undefined ? undefined : { reason }) },
  } as unknown as Managers;
  return { managers, runCommand };
}

describe('openLaunchShell', () => {
  it('runs the shell plugin\'s zsh command without a workspace from a launch origin labelled janus', async () => {
    const { managers, runCommand } = fakeManagers(true);

    await openLaunchShell(managers);

    expect(runCommand).toHaveBeenCalledWith(
      'shell', 'zsh --no-workspace', { label: 'janus', command: 'zsh --no-workspace', launch: true },
    );
    expect(managers.tab.tabs).toHaveLength(1);
  });

  it('fails with the shell plugin\'s own reason when no tab opened', async () => {
    const { managers } = fakeManagers(false, 'spawn /bin/zsh ENOENT');

    await expect(openLaunchShell(managers)).rejects.toThrow('could not open the launch shell: spawn /bin/zsh ENOENT');
  });

  it('fails with a plain reason when the plugin gave none', async () => {
    const { managers } = fakeManagers(false);

    await expect(openLaunchShell(managers)).rejects.toThrow('could not open the launch shell: the shell plugin opened no tab');
  });
});
