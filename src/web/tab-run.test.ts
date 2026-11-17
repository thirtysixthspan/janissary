import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { WebTabDeps, WebTabSpec } from './tab-run.js';
import { runWebSubcommandInTab } from './tab-run.js';

const mocks = vi.hoisted(() => ({
  localReadRoot: vi.fn(),
  withRemoteTabPort: vi.fn(),
  getProjectTokens: vi.fn(),
  notify: vi.fn(),
  core: vi.fn(),
  remote: vi.fn(),
}));

vi.mock('../file-read/tab-read.js', () => ({ localReadRoot: mocks.localReadRoot }));
vi.mock('../file-read/remote-tab-port.js', () => ({ withRemoteTabPort: mocks.withRemoteTabPort }));
vi.mock('../project/tokens.js', () => ({ getProjectTokens: mocks.getProjectTokens }));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));

const TOKENS = { tavily: 'tavily-key' };
const managers = {} as Managers;

type Parsed = { text: string };

function makeSpec(): WebTabSpec<Parsed> {
  return {
    parse: (input) => (input === 'bad' ? { error: 'Usage: web test' } : { text: input }),
    remoteOperation: 'web-test',
    remote: mocks.remote,
    core: mocks.core,
  };
}

function depsOf(call: number): WebTabDeps {
  return mocks.core.mock.calls[call][1] as WebTabDeps;
}

function remotePort(reply: (parsed: Parsed) => Promise<string>): { webTest: ReturnType<typeof vi.fn> } {
  const port = { webTest: vi.fn().mockImplementation(reply) };
  mocks.remote.mockImplementation((p: unknown, parsed: Parsed) => (p as typeof port).webTest(parsed));
  mocks.withRemoteTabPort.mockImplementation(
    (_managers: Managers, _label: string, _prefix: string, run: (port: unknown, workspace: string) => Promise<string>) =>
      run(port, '/remote/ws'),
  );
  return port;
}

describe('runWebSubcommandInTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProjectTokens.mockReturnValue(TOKENS);
    mocks.core.mockResolvedValue('local result');
  });

  it('returns a parser error unchanged without reading the tab or opening a port', async () => {
    await expect(runWebSubcommandInTab(managers, 'janus', 'bad', undefined, makeSpec())).resolves.toBe('Usage: web test');
    expect(mocks.localReadRoot).not.toHaveBeenCalled();
    expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
    expect(mocks.core).not.toHaveBeenCalled();
  });

  it('calls the local core with project tokens, fetch, signal, and a disabled reporter', async () => {
    mocks.localReadRoot.mockReturnValue('/workspace');
    const controller = new AbortController();
    await expect(runWebSubcommandInTab(managers, 'janus', 'good', controller.signal, makeSpec())).resolves.toBe('local result');
    expect(mocks.core).toHaveBeenCalledWith({ text: 'good' }, expect.anything());
    expect(depsOf(0).tokens).toBe(TOKENS);
    expect(depsOf(0).fetch).toBe(globalThis.fetch);
    expect(depsOf(0).signal).toBe(controller.signal);
    expect(mocks.withRemoteTabPort).not.toHaveBeenCalled();
  });

  it('posts one notification when the local disabled reporter is used', async () => {
    mocks.localReadRoot.mockReturnValue('/workspace');
    await runWebSubcommandInTab(managers, 'janus', 'good', undefined, makeSpec());
    depsOf(0).reportDisabled?.('tavily', 'provider failed: boom');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      managers,
      'plugin-failure',
      'janus',
      'Web provider "tavily" disabled: provider failed: boom.',
    );
  });

  it('propagates a local core rejection unchanged', async () => {
    mocks.localReadRoot.mockReturnValue('/workspace');
    const abort = new Error('The operation was aborted.');
    mocks.core.mockRejectedValueOnce(abort);
    await expect(runWebSubcommandInTab(managers, 'janus', 'good', undefined, makeSpec())).rejects.toBe(abort);
  });

  it('runs the remote spec operation through withRemoteTabPort', async () => {
    mocks.localReadRoot.mockReturnValue(undefined);
    const port = remotePort(async () => 'remote result');
    await expect(runWebSubcommandInTab(managers, 'far', 'good', undefined, makeSpec())).resolves.toBe('remote result');
    expect(mocks.withRemoteTabPort).toHaveBeenCalledWith(managers, 'far', 'web-test', expect.any(Function));
    expect(port.webTest).toHaveBeenCalledWith({ text: 'good' });
    expect(mocks.core).not.toHaveBeenCalled();
  });

  it('returns a remote rejection message unchanged', async () => {
    mocks.localReadRoot.mockReturnValue(undefined);
    remotePort(async () => {
      throw new Error('The remote connection ended.');
    });
    await expect(runWebSubcommandInTab(managers, 'far', 'good', undefined, makeSpec())).resolves.toBe('The remote connection ended.');
    expect(mocks.core).not.toHaveBeenCalled();
  });

  it('returns an unavailable remote result without calling the core or the port', async () => {
    mocks.localReadRoot.mockReturnValue(undefined);
    mocks.withRemoteTabPort.mockResolvedValue('Remote connection unavailable.');
    await expect(runWebSubcommandInTab(managers, 'far', 'good', undefined, makeSpec())).resolves.toBe('Remote connection unavailable.');
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(mocks.core).not.toHaveBeenCalled();
  });
});
