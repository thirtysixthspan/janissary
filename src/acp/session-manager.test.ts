import { describe, it, expect, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { AcpOptions, AcpSession } from './types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { makeTab } from '../tab/index.js';

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mocks.connect }));

import { AcpSessionManager } from './session-manager.js';

const ENTRY: RoleEntry = { harness: 'opencode', model: 'test-model' };

function setup() {
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

describe('AcpSessionManager.session handshake', () => {
  it('publishes once and settles once when an early error is followed by a connect', () => {
    const f = setup();
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
    const f = setup();
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
    const f = setup();
    f.start();
    f.tabs[0].runtime!.closing = true;

    f.options()!.onConnect?.({ provider: 'provider' });
    f.options()!.onError('late failure');

    expect(f.records.begin).not.toHaveBeenCalled();
    expect(f.hooks.onConnect).not.toHaveBeenCalled();
    expect(f.hooks.onError).not.toHaveBeenCalled();
  });
});
