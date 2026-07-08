import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager } from './tab-manager.js';
import { ShellManager } from './shell-manager.js';
import type { Managers } from './managers.js';

const executeShellCmdMock = vi.fn();
const queryShellPwdMock = vi.fn();
const spawnShellMock = vi.fn();

vi.mock('./shell.js', () => ({
  spawnShell: (...args: unknown[]) => spawnShellMock(...args),
  executeShellCmd: (...args: unknown[]) => executeShellCmdMock(...args),
  queryShellPwd: (...args: unknown[]) => queryShellPwdMock(...args),
}));

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('ShellManager — serializes shell interactions', () => {
  beforeEach(() => {
    executeShellCmdMock.mockReset();
    queryShellPwdMock.mockReset();
    spawnShellMock.mockReset().mockReturnValue({ stdin: { writable: true, write: vi.fn() } });
  });

  it('does not start the next queued command until the previous command\'s pwd query resolves', async () => {
    const managers = makeManagers();
    const shellManager = new ShellManager(managers);

    shellManager.run('janus', 'cmd1');
    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(1); });

    // cmd1 completes; this fires its trailing pwd query, which is left unresolved.
    const onComplete1 = executeShellCmdMock.mock.calls[0][4] as (result: string) => void;
    onComplete1('cmd1 output');
    await vi.waitFor(() => { expect(queryShellPwdMock).toHaveBeenCalledTimes(1); });

    // Queue cmd2 while cmd1's pwd query is still in flight — it must not start yet, or its
    // listener would be live on the same shell stream as cmd1's still-pending pwd query.
    shellManager.run('janus', 'cmd2');
    expect(executeShellCmdMock).toHaveBeenCalledTimes(1);

    // Resolve cmd1's pwd query — only now should cmd2 actually start.
    const onPwdResult1 = queryShellPwdMock.mock.calls[0][2] as (pwd: string) => void;
    onPwdResult1('/some/dir');

    await vi.waitFor(() => { expect(executeShellCmdMock).toHaveBeenCalledTimes(2); });
    expect(executeShellCmdMock.mock.calls[1][1]).toBe('cmd2');
  });
});
