import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { AcpOptions, AcpSession } from './types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { makeTab } from '../tab/index.js';
import { tabRuntime } from '../tab/runtime.js';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), remote: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mocks.connect }));
vi.mock('../remote/acp-session.js', () => ({ createRemoteAcpSession: mocks.remote }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../bus.js', () => ({ messageBus: { emit: vi.fn() } }));

import { AcpSessionManager } from './session-manager.js';

const ENTRY: RoleEntry = { harness: 'opencode', model: 'test-model' };

// Fixture for the explicit handshake state machine tests.
function setupHandshake() {
  const tabs = [makeTab('owner', '#fff')];
  tabs[0].title = 'Owner';
  const records = {
    begin: vi.fn(() => 'record-id'),
    prompt: vi.fn(() => true),
    activity: vi.fn(),
    answer: vi.fn(),
    close: vi.fn(),
  };
  const managers = {
    tab: { tabs, byLabel: (label: string) => tabs.find((tab) => tab.label === label) },
    acpRecords: records,
  } as unknown as Managers;
  const manager = new AcpSessionManager(managers);
  const session: AcpSession = {
    prompt: vi.fn(),
    cancel: vi.fn(async () => {}),
    kill: vi.fn(),
    shutdown: vi.fn(async () => {}),
  };
  let options: AcpOptions | undefined;
  mocks.connect.mockImplementation((opts: AcpOptions) => {
    options = opts;
    return session;
  });
  const hooks = { onError: vi.fn(), onConnect: vi.fn() };
  return {
    manager, session, hooks, tabs, records,
    options: () => options,
    start: () => manager.session('owner', '/cwd', ENTRY, hooks),
  };
}

// Fixture for the provider session id tests.
const fixtures: ReturnType<typeof setup>[] = [];

function makeSession(): AcpSession {
  return {
    prompt: vi.fn(),
    cancel: vi.fn(async () => {}),
    kill: vi.fn(),
    shutdown: vi.fn(async () => {}),
  };
}

type RemoteHooks = { onSessionStarted?: (sessionId: string) => void };

function setup() {
  const tabs = [makeTab('owner', '#fff')];
  const records = {
    begin: vi.fn(() => 'record-1'),
    close: vi.fn(),
    prompt: vi.fn(() => true),
    activity: vi.fn(),
    answer: vi.fn(),
    rows: vi.fn(() => []),
  };
  const managers = {
    acpRecords: records,
    tab: { byLabel: (label: string) => tabs.find((tab) => tab.label === label) },
    remote: { get: () => ({}) },
  } as unknown as Managers;
  const options: AcpOptions[] = [];
  mocks.connect.mockImplementation((opts: AcpOptions) => {
    options.push(opts);
    return makeSession();
  });
  const remoteHooks: RemoteHooks[] = [];
  mocks.remote.mockImplementation((_channel: unknown, _opts: unknown, hooks: RemoteHooks) => {
    remoteHooks.push(hooks);
    return makeSession();
  });
  const manager = new AcpSessionManager(managers);
  const hooks = { onError: vi.fn(), onConnect: vi.fn() };
  const fixture = { tabs, records, managers, options, remoteHooks, manager, hooks };
  fixtures.push(fixture);
  return fixture;
}

afterEach(() => {
  for (const fixture of fixtures) fixture.manager.dispose();
  fixtures.length = 0;
  vi.clearAllMocks();
});

describe('AcpSessionManager.session handshake', () => {
  it('publishes once and settles once when an early error is followed by a connect', () => {
    const f = setupHandshake();
    mocks.connect.mockImplementation((opts: AcpOptions) => {
      opts.onError('early failure');
      opts.onConnect?.({ provider: 'provider' });
      return f.session;
    });

    f.start();

    expect(f.records.begin).toHaveBeenCalledTimes(1);
    expect(f.hooks.onConnect).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledWith('early failure');
  });

  it('settles only once when two errors arrive after a connect', () => {
    const f = setupHandshake();
    f.start();
    f.options()!.onConnect?.({ provider: 'provider' });
    f.options()!.onError('first failure');
    f.options()!.onError('second failure');

    expect(f.records.begin).toHaveBeenCalledTimes(1);
    expect(f.hooks.onConnect).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledWith('first failure');
  });

  it('ignores callbacks from a session that is no longer current', () => {
    const f = setupHandshake();
    f.start();
    f.tabs[0].runtime!.closing = true;

    f.options()!.onConnect?.({ provider: 'provider' });
    f.options()!.onError('late failure');

    expect(f.records.begin).not.toHaveBeenCalled();
    expect(f.hooks.onConnect).not.toHaveBeenCalled();
    expect(f.hooks.onError).not.toHaveBeenCalled();
  });
});

describe('AcpSessionManager provider session id', () => {
  it('reports undefined before the handshake hook fires', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('reports the exact id the handshake hook reported', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);

    fixture.options[0]!.onSessionStarted?.('provider-abc');

    expect(fixture.manager.providerSessionId('owner')).toBe('provider-abc');
  });

  it('keeps the default-ask and explicit-tell ids independent', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks, 'tell');

    fixture.options[0]!.onSessionStarted?.('ask-provider');
    fixture.options[1]!.onSessionStarted?.('tell-provider');

    expect(fixture.manager.providerSessionId('owner')).toBe('ask-provider');
    expect(fixture.manager.providerSessionId('owner', 'tell')).toBe('tell-provider');
  });

  it('clears the exposed id on close so a replacement starts fresh', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    fixture.options[0]!.onSessionStarted?.('provider-abc');
    expect(fixture.manager.providerSessionId('owner')).toBe('provider-abc');

    fixture.manager.close('owner');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
    fixture.options[1]!.onSessionStarted?.('provider-second');
    expect(fixture.manager.providerSessionId('owner')).toBe('provider-second');
  });

  it('ignores a late callback from a replaced session holder', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    const stale = fixture.options[0]!;
    stale.onSessionStarted?.('old-provider');

    fixture.manager.close('owner');
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    const fresh = fixture.options[1]!;

    stale.onSessionStarted?.('late-old-provider');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    fresh.onSessionStarted?.('new-provider');
    expect(fixture.manager.providerSessionId('owner')).toBe('new-provider');
  });

  it('rejects a replaced tab runtime', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    fixture.options[0]!.onSessionStarted?.('provider-abc');

    fixture.tabs[0] = makeTab('owner', '#abc');

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('rejects a removed tab', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    fixture.options[0]!.onSessionStarted?.('provider-abc');

    fixture.tabs.length = 0;

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('rejects a closing runtime and ignores its late callback', () => {
    const fixture = setup();
    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    fixture.options[0]!.onSessionStarted?.('provider-abc');
    expect(fixture.manager.providerSessionId('owner')).toBe('provider-abc');

    tabRuntime(fixture.tabs[0]!).closing = true;
    fixture.options[0]!.onSessionStarted?.('late-provider');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    tabRuntime(fixture.tabs[0]!).closing = false;
    expect(fixture.manager.providerSessionId('owner')).toBe('provider-abc');
  });

  it('captures a synchronous callback fired before the session handle is assigned', () => {
    const fixture = setup();
    mocks.connect.mockImplementation((opts: AcpOptions) => {
      opts.onSessionStarted?.('sync-provider');
      return makeSession();
    });

    fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);

    expect(fixture.manager.providerSessionId('owner')).toBe('sync-provider');
  });

  it('keeps the internal session identity distinct and unchanged by the provider id', () => {
    const fixture = setup();
    const session = fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks);
    const identity = fixture.manager.sessionIdentity('owner');

    fixture.options[0]!.onSessionStarted?.('provider-abc');

    expect(session).toBeDefined();
    expect(identity).toMatch(/^acp-\d+$/);
    expect(fixture.manager.sessionIdentity('owner')).toBe(identity);
    expect(identity).not.toBe('provider-abc');
    expect(fixture.manager.providerSessionId('owner')).toBe('provider-abc');
  });
});

describe('AcpSessionManager remote provider session id', () => {
  function startRemote(fixture: ReturnType<typeof setup>, role: 'ask' | 'tell' = 'ask') {
    fixture.tabs[0]!.remote = { address: 'stub-host', host: 'stub-host' };
    return fixture.manager.session('owner', '/cwd', ENTRY, fixture.hooks, role);
  }

  it('reports undefined before the remote handshake hook fires', () => {
    const fixture = setup();
    startRemote(fixture);

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('reports the remote id while readiness is still pending', () => {
    const fixture = setup();
    startRemote(fixture);

    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');

    expect(fixture.manager.providerSessionId('owner')).toBe('remote-provider');
  });

  it('keeps remote ask and tell ids independent', () => {
    const fixture = setup();
    startRemote(fixture);
    startRemote(fixture, 'tell');

    fixture.remoteHooks[0]!.onSessionStarted?.('ask-remote');
    fixture.remoteHooks[1]!.onSessionStarted?.('tell-remote');

    expect(fixture.manager.providerSessionId('owner')).toBe('ask-remote');
    expect(fixture.manager.providerSessionId('owner', 'tell')).toBe('tell-remote');
  });

  it('captures a synchronous remote callback fired before the session handle is assigned', () => {
    const fixture = setup();
    mocks.remote.mockImplementation((_channel: unknown, _opts: unknown, hooks: RemoteHooks) => {
      hooks.onSessionStarted?.('sync-remote');
      return makeSession();
    });

    startRemote(fixture);

    expect(fixture.manager.providerSessionId('owner')).toBe('sync-remote');
  });

  it('clears the remote id on close and starts a replacement fresh', () => {
    const fixture = setup();
    startRemote(fixture);
    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');
    expect(fixture.manager.providerSessionId('owner')).toBe('remote-provider');

    fixture.manager.close('owner');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    startRemote(fixture);
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
    fixture.remoteHooks[1]!.onSessionStarted?.('second-remote');
    expect(fixture.manager.providerSessionId('owner')).toBe('second-remote');
  });

  it('ignores a late callback from a replaced remote holder', () => {
    const fixture = setup();
    startRemote(fixture);
    const stale = fixture.remoteHooks[0]!;
    stale.onSessionStarted?.('first-remote');

    fixture.manager.close('owner');
    startRemote(fixture);
    stale.onSessionStarted?.('late-remote');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    fixture.remoteHooks[1]!.onSessionStarted?.('fresh-remote');
    expect(fixture.manager.providerSessionId('owner')).toBe('fresh-remote');
  });

  it('rejects a replaced remote tab runtime', () => {
    const fixture = setup();
    startRemote(fixture);
    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');

    fixture.tabs[0] = makeTab('owner', '#abc');

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('rejects a removed remote tab', () => {
    const fixture = setup();
    startRemote(fixture);
    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');

    fixture.tabs.length = 0;

    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();
  });

  it('rejects a closing remote runtime and ignores its late callback', () => {
    const fixture = setup();
    startRemote(fixture);
    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');
    expect(fixture.manager.providerSessionId('owner')).toBe('remote-provider');

    tabRuntime(fixture.tabs[0]!).closing = true;
    fixture.remoteHooks[0]!.onSessionStarted?.('late-remote');
    expect(fixture.manager.providerSessionId('owner')).toBeUndefined();

    tabRuntime(fixture.tabs[0]!).closing = false;
    expect(fixture.manager.providerSessionId('owner')).toBe('remote-provider');
  });

  it('keeps the internal session identity distinct from the remote provider id', () => {
    const fixture = setup();
    startRemote(fixture);
    const identity = fixture.manager.sessionIdentity('owner');

    fixture.remoteHooks[0]!.onSessionStarted?.('remote-provider');

    expect(identity).toMatch(/^acp-\d+$/);
    expect(identity).not.toBe('remote-provider');
    expect(fixture.manager.sessionIdentity('owner')).toBe(identity);
    expect(fixture.manager.providerSessionId('owner')).toBe('remote-provider');
  });
});
