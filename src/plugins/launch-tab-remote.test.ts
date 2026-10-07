import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import type { RemoteLaunchHandlers } from '../remote/manager.js';
import type { TabPluginDeclaration, TabPluginLaunchRequest } from './api.js';
import { TabPluginRejection } from './api-capabilities.js';
import { launchRemotePluginTab } from './launch-tab-remote.js';
import type { LaunchInput } from './launch-tab.js';
import { notify } from '../notifications/index.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const declaration: TabPluginDeclaration = {
  id: 'shell', version: '1', apiVersion: 1, payloadSchemaVersion: 4, tabLabelPrefix: 'shell', fileExtensions: {},
};

function harness() {
  const channels: { label: string; handlers: RemoteLaunchHandlers }[] = [];
  const opened: { label: string; start: unknown; payload: unknown }[] = [];
  const tabs: { label: string; plugin?: { id: string; instanceKey: string; payload: unknown; busy?: boolean } }[] = [
    { label: 'janus' },
  ];
  const closeRemote = vi.fn((label: string) => {
    const index = tabs.findIndex((tab) => tab.label === label);
    if (index !== -1) tabs.splice(index, 1);
  });
  const managers = {
    tab: {
      launchDir: '/repo', tabs, allLabels: () => tabs.map((tab) => tab.label),
      cwdOf: () => '/repo/src', byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      pluginTabByInstanceKey: (id: string, key: string) => tabs.find((tab) => tab.plugin?.id === id && tab.plugin.instanceKey === key),
      openPluginTab: (
        id: string, _prefix: string, instanceKey: string, _version: number, _source: string,
        factory: (resources: object) => unknown, naming: { label: string; cwd: string; remote: unknown },
      ) => {
        const start = { label: naming.label, cwd: naming.cwd, connectPtyId: `connect-${channels.length - 1}`, host: 'devbox' };
        const payload = factory({});
        opened.push({ label: naming.label, start, payload });
        tabs.push({ label: naming.label, plugin: { id, instanceKey, payload } });
      },
      setCwd: vi.fn(),
      findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
      closeTab: (index: number) => {
        const [tab] = tabs.splice(index, 1);
        if (tab) closeRemote(tab.label);
      },
    },
    sessions: { view: () => [] },
    remote: {
      create: vi.fn((label: string, _address: unknown, _cwd: string, handlers: RemoteLaunchHandlers) => {
        channels.push({ label, handlers });
        return { ptyId: `connect-${channels.length - 1}` };
      }),
      closeTab: closeRemote,
    },
  } as unknown as Managers;
  const invoked: unknown[] = [];
  const input: LaunchInput = {
    managers, declaration, origin: { label: 'janus', command: 'zsh' }, isEnabled: () => true,
    validate: () => {},
    deferred: {
      invoke: async (call) => {
        invoked.push(await call({} as never));
        return { status: 'ok' };
      },
      disable: vi.fn(),
    },
  };
  return { channels, opened, tabs, managers, input, invoked };
}

const factory = (_resources: object, start: { label: string; cwd: string; connectPtyId?: string; host?: string }) => ({
  title: 'shell', payload: { provisioning: true, connectPtyId: start.connectPtyId, host: start.host },
});
const ready = vi.fn();

describe('launchRemotePluginTab', () => {
  it('validates the address before opening a channel', () => {
    const h = harness();

    expect(() => launchRemotePluginTab(h.input, 'shell-1', { remote: { address: 'bad;host' } }, factory, ready))
      .toThrow(TabPluginRejection);
    expect(h.managers.remote.create).not.toHaveBeenCalled();
  });

  it('opens a labelled provisioning tab attached to the SSH PTY, then calls ready with the remote path and host', async () => {
    const h = harness();

    expect(launchRemotePluginTab(h.input, 'shell-1', { remote: { address: 'devbox' }, name: 'docs' }, factory, ready))
      .toEqual({ label: 'docs' });
    expect(h.opened[0]).toMatchObject({
      label: 'docs', start: { connectPtyId: 'connect-0', host: 'devbox' },
      payload: { payload: { connectPtyId: 'connect-0', host: 'devbox' } },
    });
    expect(h.tabs.find((tab) => tab.label === 'docs')?.plugin?.busy).toBe(true);

    h.channels[0]?.handlers.onReady('/remote/docs', 'sandbox notice');
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({
      workspaceDir: '/remote/docs', displayDir: '/remote/docs', host: 'devbox', sandboxNotice: 'sandbox notice',
    }), expect.anything());
    expect(h.managers.tab.setCwd).toHaveBeenCalledWith('docs', '/remote/docs');
    expect(h.tabs.find((tab) => tab.label === 'docs')?.plugin?.busy).toBe(false);
  });

  it('retries an unnamed pool label after the remote host reports it in use', async () => {
    const h = harness();
    const request: TabPluginLaunchRequest = { remote: { address: 'devbox' } };
    launchRemotePluginTab(h.input, 'shell-1', request, factory, ready);
    const first = h.channels[0]?.label;

    h.channels[0]?.handlers.onNameRefused?.({ type: 'name-in-use', label: first ?? '' });
    await vi.waitFor(() => expect(h.channels).toHaveLength(2));

    expect(h.channels[1]?.label).not.toBe(first);
    expect(h.tabs.some((tab) => tab.label === first)).toBe(false);
  });

  it('releases the SSH channel if the tab factory fails to open', () => {
    const h = harness();

    expect(() => launchRemotePluginTab(h.input, 'shell-1', { remote: { address: 'devbox' } }, () => {
      throw new Error('factory failed');
    }, ready)).toThrow('factory failed');
    expect(h.managers.remote.closeTab).toHaveBeenCalled();
  });

  it('posts remote launch failures and closes the placeholder after the message is visible', async () => {
    vi.useFakeTimers();
    const h = harness();
    launchRemotePluginTab(h.input, 'shell-1', { name: 'docs', remote: { address: 'devbox' } }, factory, ready);

    h.channels[0]?.handlers.onFailed('authentication failed');
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(
      h.managers, 'manual', 'janus', 'Failed to start "docs" on devbox: authentication failed',
    ));
    expect(h.tabs.some((tab) => tab.label === 'docs')).toBe(true);

    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS);
    expect(h.tabs.some((tab) => tab.label === 'docs')).toBe(false);
    expect(h.managers.remote.closeTab).toHaveBeenCalledWith('docs');
  });

  it('releases the channel when its provisioning tab is closed and ignores a late ready frame', async () => {
    const h = harness();
    launchRemotePluginTab(h.input, 'shell-1', { name: 'docs', remote: { address: 'devbox' } }, factory, ready);

    h.managers.tab.closeTab(h.managers.tab.findIndex('docs'));
    h.channels[0]?.handlers.onReady('/remote/docs');
    await Promise.resolve();

    expect(h.managers.remote.closeTab).toHaveBeenCalledWith('docs');
    expect(ready).not.toHaveBeenCalled();
  });
});
