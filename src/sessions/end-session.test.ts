import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { RemoteChannel } from '../remote/channel.js';
import type { RemoteLaunchHandlers } from '../remote/manager.js';
import type { EndOutcome } from './end-session.js';
import { endParkedSession } from './end-session.js';
import type { RemoteSessionRecord } from './store.js';

// The end channel's settlement races the explicit close it triggers: `RemoteManager.close` runs its
// launch handlers' `onClosed` sweep synchronously, and this channel's own handler is registered on
// the closing entry. The outcome has to be settled before that sweep can speak.

type Resume = { session: string; workspaceDir: string; onResult: (accepted: boolean) => void };

type FakedRemote = {
  managers: Managers;
  handlers: RemoteLaunchHandlers;
  resume: Resume;
  closeCalls: string[];
};

function fakedRemote(): FakedRemote {
  const state = { managers: undefined, handlers: undefined, resume: undefined, closeCalls: [] } as Partial<FakedRemote>;
  const faked = state as FakedRemote;
  const open = (_label: string, _address: unknown, _cwd: string, handlers: RemoteLaunchHandlers,
    resume: Resume): RemoteChannel => {
    faked.handlers = handlers;
    faked.resume = resume;
    return { close: vi.fn() } as unknown as RemoteChannel;
  };
  // Like `RemoteManager.close`: synchronously invokes the registered launch handlers' `onClosed`.
  const close = (label: string): boolean => {
    faked.closeCalls.push(label);
    faked.handlers?.onClosed();
    return true;
  };
  faked.managers = { remote: { open, close } } as unknown as Managers;
  return faked;
}

function record(): RemoteSessionRecord {
  return {
    session: 'session-1', address: 'devbox:~/project', host: 'devbox',
    workspaceDir: '/remote/ws', launchLabel: 'claude',
  } as unknown as RemoteSessionRecord;
}

function start(one: RemoteSessionRecord): { promise: Promise<EndOutcome>; fake: FakedRemote } {
  const fake = fakedRemote();
  const promise = endParkedSession(fake.managers, one);
  return { promise, fake };
}

describe('endParkedSession', () => {
  // The booked bug: the accepted close's `onClosed` sweep used to settle the promise as an ordinary
  // connection gone, so every working end was presented as a failure and kept its record.
  it('resolves ended on the accepted reattach even though its close sweeps onClosed', async () => {
    const { promise, fake } = start(record());
    fake.resume.onResult(true);
    await expect(promise).resolves.toEqual({ ended: true });
    expect(fake.closeCalls).toEqual(['end-session:session-1']);
  });

  it('resolves ended when the peer refuses the reattach and never closes', async () => {
    const { promise, fake } = start(record());
    fake.resume.onResult(false);
    await expect(promise).resolves.toEqual({ ended: true });
    expect(fake.closeCalls).toEqual([]);
  });

  it('treats a failed launch as not ended', async () => {
    const { promise, fake } = start(record());
    fake.handlers.onFailed('devbox: unreachable');
    await expect(promise).resolves.toEqual({ ended: false, reason: 'devbox: unreachable' });
  });

  it('treats a connection lost before an answer as not ended', async () => {
    const { promise, fake } = start(record());
    fake.handlers.onClosed();
    await expect(promise)
      .resolves.toEqual({ ended: false, reason: 'The connection to devbox closed.' });
  });

  it('never opens a channel for an unparseable address', async () => {
    const fake = fakedRemote();
    const open = vi.fn();
    (fake.managers.remote as { open: unknown }).open = open;
    const promise = endParkedSession(fake.managers, { ...record(), address: 'dev box' });
    await expect(promise).resolves.toMatchObject({ ended: false });
    expect(open).not.toHaveBeenCalled();
  });
});
