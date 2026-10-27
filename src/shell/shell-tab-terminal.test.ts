import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { SHELL_COMMAND, SHELL_PLUGIN_ID, shellTabPtyId } from './shell-tab-terminal.js';

const terminalPayload = {
  instanceKey: 'shell-test', ptyId: 'pty-1', cwd: '/repo', root: '/repo', workspace: false,
  cols: 80, rows: 24, connections: [], schedule: [], hookNonce: 'f'.repeat(32),
};

function createTab(pluginId: string, payload: unknown): Tab {
  return {
    label: 'shell-test', dotColor: '#fff', number: 1, view: 'plugin',
    plugin: { id: pluginId, instanceKey: 'shell-test', schemaVersion: 1, payload, fileRefs: [], sourceLabel: 'shell-test' },
    group: 1, groupColor: '#fff', log: [], cmdHistory: [], cmdHistoryIdx: 0, scrollOffset: 0,
  };
}

function createManagers(hostAccepts: boolean) {
  const isPayload = vi.fn((_id: string, _payload: unknown) => hostAccepts);
  return { managers: { plugins: { isPayload } } as unknown as Managers, isPayload };
}

describe('shell tab terminal', () => {
  it('exports the shell command and plugin id', () => {
    expect(SHELL_PLUGIN_ID).toBe('shell');
    expect(SHELL_COMMAND).toBe('shell --no-workspace');
  });

  it('returns the terminal id when both payload guards accept a shell tab', () => {
    const { managers, isPayload } = createManagers(true);

    expect(shellTabPtyId(createTab(SHELL_PLUGIN_ID, terminalPayload), managers)).toBe('pty-1');
    expect(isPayload).toHaveBeenCalledWith(SHELL_PLUGIN_ID, terminalPayload);
  });

  it('returns undefined for a provisioning shell without a terminal', () => {
    const { managers } = createManagers(true);
    const provisioningPayload = {
      instanceKey: 'shell-test', cwd: '/repo', root: '/repo', workspace: true, connections: [], schedule: [],
      hookNonce: 'f'.repeat(32), provisioning: true,
    };

    expect(shellTabPtyId(createTab(SHELL_PLUGIN_ID, provisioningPayload), managers)).toBeUndefined();
  });

  it('requires both the host guard and the shell contract guard to accept the payload', () => {
    const hostRefused = createManagers(false);
    const contractRefused = createManagers(true);

    expect(shellTabPtyId(createTab(SHELL_PLUGIN_ID, terminalPayload), hostRefused.managers)).toBeUndefined();
    expect(shellTabPtyId(createTab(SHELL_PLUGIN_ID, { ptyId: 'pty-1' }), contractRefused.managers)).toBeUndefined();
  });

  it('ignores missing tabs and tabs owned by another plugin', () => {
    const { managers, isPayload } = createManagers(true);

    expect(shellTabPtyId(undefined, managers)).toBeUndefined();
    expect(shellTabPtyId(createTab('image', terminalPayload), managers)).toBeUndefined();
    expect(isPayload).not.toHaveBeenCalled();
  });
});
