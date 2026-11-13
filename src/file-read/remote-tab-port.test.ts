import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { REMOTE_UNAVAILABLE, withRemoteTabPort } from './remote-tab-port.js';

function fakeManagers(options: { channel?: boolean; ready?: boolean; workspace?: boolean } = {}) {
  const channel = { attachNavigator: vi.fn(), detachNavigator: vi.fn(), send: vi.fn() };
  const managers = {
    remote: {
      get: () => (options.channel === false ? undefined : channel),
      readyOf: () => (options.ready === false ? undefined : Promise.resolve('/remote/ws')),
      workspaceOf: () => (options.workspace === false ? undefined : '/remote/ws'),
    },
  } as unknown as Managers;
  return { managers, channel };
}

describe('withRemoteTabPort', () => {
  it.each([{ channel: false }, { ready: false }, { workspace: false }])(
    'reports the remote unavailable without running when %o',
    async (missing) => {
      const { managers } = fakeManagers(missing);
      const run = vi.fn();
      await expect(withRemoteTabPort(managers, 'janus', 'file-read', run)).resolves.toBe(REMOTE_UNAVAILABLE);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('reports the remote unavailable when the tab has no remote manager', async () => {
    const run = vi.fn();
    await expect(withRemoteTabPort({} as Managers, 'janus', 'file-read', run)).resolves.toBe(REMOTE_UNAVAILABLE);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs with the remote workspace, returns the result, and disposes the port', async () => {
    const { managers, channel } = fakeManagers();
    const result = await withRemoteTabPort(managers, 'janus', 'file-write', (_port, workspace) => Promise.resolve(`ran in ${workspace}`));
    expect(result).toBe('ran in /remote/ws');
    expect(channel.detachNavigator).toHaveBeenCalledTimes(1);
  });

  it('opens each port under an incrementing prefixed session id', async () => {
    const { managers, channel } = fakeManagers();
    const run = () => Promise.resolve('ok');
    await withRemoteTabPort(managers, 'janus', 'file-read', run);
    await withRemoteTabPort(managers, 'janus', 'file-write', run);
    const [first, second] = channel.attachNavigator.mock.calls.map(([id]) => String(id));
    expect(first).toMatch(/^file-read-\d+$/);
    expect(second).toMatch(/^file-write-\d+$/);
    expect(Number(second?.split('-').at(-1))).toBe(Number(first?.split('-').at(-1)) + 1);
  });

  it('disposes the port when the run throws', async () => {
    const { managers, channel } = fakeManagers();
    await expect(withRemoteTabPort(managers, 'janus', 'file-read', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(channel.detachNavigator).toHaveBeenCalledTimes(1);
  });
});
