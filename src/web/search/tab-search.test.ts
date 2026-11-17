import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import type { WebSearchCommand } from './command.js';
import { WEB_SEARCH_USAGE } from './command.js';
import type { WebSearchDeps } from './search.js';
import { searchWebInTab } from './tab-search.js';

const mocks = vi.hoisted(() => ({
  webSearch: vi.fn(),
  withRemoteTabPort: vi.fn(),
  notify: vi.fn(),
  getProjectTokens: vi.fn(),
}));

vi.mock('./search.js', () => ({ webSearch: mocks.webSearch }));
vi.mock('../../file-read/remote-tab-port.js', () => ({
  REMOTE_UNAVAILABLE: 'Remote connection unavailable.',
  withRemoteTabPort: mocks.withRemoteTabPort,
}));
vi.mock('../../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../../project/tokens.js', () => ({ getProjectTokens: mocks.getProjectTokens }));

const TOKENS = { tavily: 'tavily-key' };

const PARSED: WebSearchCommand = {
  query: 'node.js',
  numResults: 10,
  maxChars: 10_000,
  depth: 'basic',
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

function depsOf(call: number): WebSearchDeps {
  return (mocks.webSearch.mock.calls[call] as [WebSearchCommand, WebSearchDeps])[1];
}

describe('searchWebInTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProjectTokens.mockReturnValue(TOKENS);
    mocks.webSearch.mockResolvedValue('search results');
  });

  it.each(['web', 'web foo', 'web search', 'web search x --results 30'])(
    'prints the usage line for %j without touching the tab or a port',
    async (line) => {
      const { managers, lookups } = localManagers();
      await expect(searchWebInTab(managers, 'janus', line)).resolves.toBe(WEB_SEARCH_USAGE);
      expect(lookups).toEqual([]);
      expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
      expect(mocks.webSearch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a workspace', { label: 'janus', workspaceDir: '/workspace' }],
    ['no workspace', { label: 'janus' }],
  ] as const)('searches locally for a local tab with %s', async (_case, tab) => {
    const { managers } = localManagers(tab);
    await expect(searchWebInTab(managers, 'janus', 'web search node.js')).resolves.toBe('search results');
    expect(mocks.webSearch).toHaveBeenCalledOnce();
    expect(mocks.webSearch).toHaveBeenCalledWith(PARSED, expect.anything());
    expect(depsOf(0).tokens).toBe(TOKENS);
    expect(depsOf(0).fetch).toBe(globalThis.fetch);
    expect(depsOf(0).signal).toBeUndefined();
    expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
  });

  it('passes the given signal to the local search', async () => {
    const { managers } = localManagers();
    const controller = new AbortController();
    await searchWebInTab(managers, 'janus', 'web search node.js', controller.signal);
    expect(depsOf(0).signal).toBe(controller.signal);
  });

  it('posts one notification when a local search disables a provider', async () => {
    const { managers } = localManagers();
    await searchWebInTab(managers, 'janus', 'web search node.js');
    depsOf(0).reportDisabled?.('tavily', 'provider failed: boom');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      managers,
      'plugin-failure',
      'janus',
      'Web provider "tavily" disabled: provider failed: boom.',
    );
  });

  it('propagates a local search rejection unchanged', async () => {
    const { managers } = localManagers();
    const abort = new Error('The operation was aborted.');
    mocks.webSearch.mockRejectedValueOnce(abort);
    await expect(searchWebInTab(managers, 'janus', 'web search node.js', AbortSignal.abort())).rejects.toBe(abort);
  });

  it('searches on the remote machine for a remote tab', async () => {
    const port = { webSearch: vi.fn().mockResolvedValue('remote results') };
    mocks.withRemoteTabPort.mockImplementation(
      (_managers: Managers, _label: string, _prefix: string, run: (port: unknown, workspace: string) => Promise<string>) =>
        run(port, '/remote/ws'),
    );
    const managers = remoteManagers();
    await expect(searchWebInTab(managers, 'far', 'web search node.js')).resolves.toBe('remote results');
    expect(mocks.withRemoteTabPort).toHaveBeenCalledWith(managers, 'far', 'web-search', expect.any(Function));
    expect(port.webSearch).toHaveBeenCalledWith(PARSED);
    expect(mocks.webSearch).not.toHaveBeenCalled();
  });

  it('returns the unavailable line without a local fallback', async () => {
    mocks.withRemoteTabPort.mockResolvedValue('Remote connection unavailable.');
    await expect(searchWebInTab(remoteManagers(), 'far', 'web search node.js')).resolves.toBe('Remote connection unavailable.');
    expect(mocks.webSearch).not.toHaveBeenCalled();
  });

  it.each(['The remote connection ended.', 'The remote machine did not answer in time.'])(
    'returns a remote rejection %j unchanged',
    async (message) => {
      const port = { webSearch: vi.fn().mockRejectedValue(new Error(message)) };
      mocks.withRemoteTabPort.mockImplementation(
        (_managers: Managers, _label: string, _prefix: string, run: (port: unknown, workspace: string) => Promise<string>) =>
          run(port, '/remote/ws'),
      );
      await expect(searchWebInTab(remoteManagers(), 'far', 'web search node.js')).resolves.toBe(message);
      expect(mocks.webSearch).not.toHaveBeenCalled();
    },
  );
});
