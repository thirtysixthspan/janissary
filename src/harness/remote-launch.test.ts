import { describe, it, expect, vi } from 'vitest';
import { startRemoteLaunch } from './remote-launch.js';
import { LaunchNameRefusal, RemoteRootRefusal } from '../launch-name/refusal.js';
import type { Managers } from '../managers.js';
import type { RemoteAddress } from '../remote/address.js';
import type { RemoteLaunchHandlers } from '../remote/entry-factory.js';

// The refusal arms are the only part of a remote launch that decides *how* a failure is reported,
// and each is distinguished by its class: `failRemoteLaunch` tells a host that refused the label
// apart from one that could not settle a root, and both apart from a channel that simply died. A
// callback arriving after the launch has settled is a different case again — the tab is closed
// rather than the settled promise being rejected a second time.

const ADDRESS = { host: 'devbox', destination: 'devbox', raw: 'devbox' } as RemoteAddress;
const REFUSAL = { kind: 'not-repository', path: '/srv/plain' };
const RESOLVED = Symbol('resolved');

type Harness = {
  managers: Managers;
  handlers: () => RemoteLaunchHandlers;
  closed: number[];
};

// What `ready` settled to: the refusal it rejected with, or `RESOLVED`.
async function outcome(ready: Promise<void>): Promise<unknown> {
  try {
    await ready;
    return RESOLVED;
  } catch (error) {
    return error;
  }
}

function harness(): Harness {
  let captured: RemoteLaunchHandlers = {};
  const closed: number[] = [];
  const tabs = ['placeholder'];
  const managers = {
    tab: {
      findIndex: (label: string) => tabs.indexOf(label),
      closeTab: (index: number) => { closed.push(index); tabs.splice(index, 1); },
    },
    remote: {
      create: vi.fn((_label: string, _address: unknown, _cwd: string, handlers: RemoteLaunchHandlers) => {
        captured = handlers;
        return { ptyId: 'pty-1' };
      }),
    },
  } as unknown as Managers;
  return { managers, handlers: () => captured, closed };
}

describe('startRemoteLaunch refusals', () => {
  it('refuses a label the host already has running', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');

    h.handlers().onNameRefused?.({ type: 'name-in-use', label: 'placeholder' } as never);

    const failure = await outcome(launch.ready);
    expect(failure).toBeInstanceOf(LaunchNameRefusal);
    expect(failure).toMatchObject({ label: 'placeholder', host: 'devbox' });
  });

  it('carries a leftover it could not remove, and why', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');

    h.handlers().onNameRefused?.({
      type: 'name-in-use', label: 'placeholder', path: '/remote/workspace/placeholder', reason: 'busy',
    } as never);

    const failure = await outcome(launch.ready);
    expect(failure).toBeInstanceOf(LaunchNameRefusal);
    expect(failure).toMatchObject({ path: '/remote/workspace/placeholder', reason: 'busy' });
  });

  it('refuses a host with no usable project root', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');

    h.handlers().onRootRefused?.(REFUSAL as never);

    const failure = await outcome(launch.ready);
    expect(failure).toBeInstanceOf(RemoteRootRefusal);
    expect(failure).toMatchObject({ host: 'devbox', refusal: REFUSAL });
  });

  it('ignores a refusal that arrives after the workspace is already ready', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');

    h.handlers().onReady?.('/remote/workspace/placeholder', 'sandboxed');
    h.handlers().onNameRefused?.({ type: 'name-in-use', label: 'placeholder' } as never);
    h.handlers().onRootRefused?.(REFUSAL as never);

    expect(await outcome(launch.ready)).toBe(RESOLVED);
    expect(launch.cwd()).toBe('/remote/workspace/placeholder');
    expect(launch.notice()).toBe('sandboxed');
    expect(h.closed).toEqual([]);
  });

  // A channel that dies after the workspace landed is a finished session, not a failed launch: the
  // tab closes the way a harness tab closes when its process exits, and the settled promise stands.
  it('closes the tab once when the channel dies after the workspace was ready', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');
    h.handlers().onReady?.('/remote/workspace/placeholder');

    h.handlers().onFailed?.('connection reset');
    h.handlers().onClosed?.();

    expect(await outcome(launch.ready)).toBe(RESOLVED);
    expect(h.closed).toEqual([0]);
  });

  it('reports the ready workspace, the leftover it cleaned, and the root it cloned', async () => {
    const h = harness();
    const launch = startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local');
    const cloned = { url: 'git@github.com:owner/repo.git', path: '/srv/repo' };

    h.handlers().onReady?.('/remote/workspace/placeholder', 'isolated', '/remote/workspace/stale', cloned);

    expect(await outcome(launch.ready)).toBe(RESOLVED);
    expect(launch.cwd()).toBe('/remote/workspace/placeholder');
    expect(launch.cleaned()).toBe('/remote/workspace/stale');
    expect(launch.cloned()).toEqual(cloned);
  });

  it('hands the pty id back before the workspace is ready, so the placeholder can attach', () => {
    const h = harness();
    expect(startRemoteLaunch(h.managers, 'placeholder', ADDRESS, '/local').ptyId).toBe('pty-1');
  });
});
