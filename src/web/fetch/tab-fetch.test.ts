import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import type { WebFetchCommand } from './command.js';
import { WEB_FETCH_USAGE } from './command.js';
import type { WebFetchDeps } from './fetch.js';
import { fetchWebInTab } from './tab-fetch.js';

const mocks = vi.hoisted(() => ({
  webFetch: vi.fn(),
  withRemoteTabPort: vi.fn(),
  notify: vi.fn(),
  getProjectTokens: vi.fn(),
}));

vi.mock('./fetch.js', () => ({ webFetch: mocks.webFetch }));
vi.mock('../../file-read/remote-tab-port.js', () => ({
  REMOTE_UNAVAILABLE: 'Remote connection unavailable.',
  withRemoteTabPort: mocks.withRemoteTabPort,
}));
vi.mock('../../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../../project/tokens.js', () => ({ getProjectTokens: mocks.getProjectTokens }));

const TOKENS = { tavily: 'tavily-key' };

const PARSED: WebFetchCommand = {
  url: 'https://example.com/page',
  format: 'markdown',
  timeoutSeconds: 30,
  maxChars: 10_000,
  offset: 0,
  provider: 'auto',
};

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

function managersWith(tab: FakeTab | undefined, lookups: string[]): Managers {
  return {
    tab: {
      launchDir: '/launch',
      byLabel: (label: string) => {
        lookups.push(label);
        return tab;
      },
    },
  } as unknown as Managers;
}

function localManagers(tab?: FakeTab) {
  const lookups: string[] = [];
  return { managers: managersWith(tab ?? { label: 'janus', workspaceDir: '/workspace' }, lookups), lookups };
}

function remoteManagers(): Managers {
  const lookups: string[] = [];
  return managersWith({ label: 'far', workspaceDir: '/workspace', remote: { host: 'box' } }, lookups);
}

function depsOf(call: number): WebFetchDeps {
  return (mocks.webFetch.mock.calls[call] as [WebFetchCommand, WebFetchDeps])[1];
}

describe('fetchWebInTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProjectTokens.mockReturnValue(TOKENS);
    mocks.webFetch.mockResolvedValue('fetched page');
  });

  it.each(['web fetch', 'web fetch example.com', 'web fetch https://x --bogus 1'])(
    'prints the usage line for %j without touching the tab or a port',
    async (line) => {
      const { managers, lookups } = localManagers();
      await expect(fetchWebInTab(managers, 'janus', line)).resolves.toBe(WEB_FETCH_USAGE);
      expect(lookups).toEqual([]);
      expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
      expect(mocks.webFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a workspace', { label: 'janus', workspaceDir: '/workspace' }],
    ['no workspace', { label: 'janus' }],
  ] as const)('fetches locally for a local tab with %s', async (_case, tab) => {
    const { managers } = localManagers(tab);
    await expect(fetchWebInTab(managers, 'janus', 'web fetch https://example.com/page')).resolves.toBe('fetched page');
    expect(mocks.webFetch).toHaveBeenCalledOnce();
    expect(mocks.webFetch).toHaveBeenCalledWith(PARSED, expect.anything());
    expect(depsOf(0).tokens).toBe(TOKENS);
    expect(depsOf(0).fetch).toBe(globalThis.fetch);
    expect(depsOf(0).signal).toBeUndefined();
    expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
  });

  it('passes the given signal to the local fetch', async () => {
    const { managers } = localManagers();
    const controller = new AbortController();
    await fetchWebInTab(managers, 'janus', 'web fetch https://example.com/page', controller.signal);
    expect(depsOf(0).signal).toBe(controller.signal);
  });

  it('posts one notification when a local fetch disables a provider', async () => {
    const { managers } = localManagers();
    await fetchWebInTab(managers, 'janus', 'web fetch https://example.com/page');
    depsOf(0).reportDisabled?.('tavily', 'provider failed: boom');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      managers,
      'plugin-failure',
      'janus',
      'Web provider "tavily" disabled: provider failed: boom.',
    );
  });

  it('propagates a local fetch rejection unchanged', async () => {
    const { managers } = localManagers();
    const abort = new Error('The operation was aborted.');
    mocks.webFetch.mockRejectedValueOnce(abort);
    await expect(fetchWebInTab(managers, 'janus', 'web fetch https://example.com/page', AbortSignal.abort())).rejects.toBe(abort);
  });

  it('fetches on the remote machine for a remote tab', async () => {
    const port = { webFetch: vi.fn().mockResolvedValue('remote page') };
    mocks.withRemoteTabPort.mockImplementation(
      (_managers: Managers, _label: string, _prefix: string, run: (port: unknown, workspace: string) => Promise<string>) =>
        run(port, '/remote/ws'),
    );
    const managers = remoteManagers();
    const controller = new AbortController();
    await expect(fetchWebInTab(managers, 'far', 'web fetch https://example.com/page', controller.signal)).resolves.toBe('remote page');
    expect(mocks.withRemoteTabPort).toHaveBeenCalledWith(managers, 'far', 'web-fetch', expect.any(Function));
    expect(port.webFetch).toHaveBeenCalledOnce();
    expect(port.webFetch).toHaveBeenCalledWith(PARSED);
    expect(mocks.webFetch).not.toHaveBeenCalled();
  });

  it('returns the unavailable line without a local fallback', async () => {
    mocks.withRemoteTabPort.mockResolvedValue('Remote connection unavailable.');
    await expect(fetchWebInTab(remoteManagers(), 'far', 'web fetch https://example.com/page')).resolves.toBe('Remote connection unavailable.');
    expect(mocks.webFetch).not.toHaveBeenCalled();
  });

  it.each(['The remote connection ended.', 'The remote machine did not answer in time.', 'Web fetch: boom.'])(
    'returns a remote rejection %j unchanged',
    async (message) => {
      const port = { webFetch: vi.fn().mockRejectedValue(new Error(message)) };
      mocks.withRemoteTabPort.mockImplementation(
        (_managers: Managers, _label: string, _prefix: string, run: (port: unknown, workspace: string) => Promise<string>) =>
          run(port, '/remote/ws'),
      );
      await expect(fetchWebInTab(remoteManagers(), 'far', 'web fetch https://example.com/page')).resolves.toBe(message);
      expect(mocks.webFetch).not.toHaveBeenCalled();
    },
  );
});
