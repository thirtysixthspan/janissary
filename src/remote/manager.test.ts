import { describe, it, expect, vi } from 'vitest';
import { RemoteManager, remoteServeCommand, type RemoteLaunchHandlers } from './manager.js';
import { parseRemoteAddress, type RemoteAddress } from './address.js';
import { encodeFrame, encodeHandshake } from './protocol.js';
import type { Managers } from '../managers.js';

function address(token: string): RemoteAddress {
  const parsed = parseRemoteAddress(token);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
}

describe('remoteServeCommand', () => {
  it('runs remote-serve through an interactive shell so rc-file PATH setup applies', () => {
    expect(remoteServeCommand(address('devbox'))).toBe(`ssh -t devbox '$SHELL -ic "janus remote-serve"'`);
  });

  it('puts the remote path inside the interactive shell command', () => {
    expect(remoteServeCommand(address('devbox:/srv/proj')))
      .toBe(`ssh -t devbox '$SHELL -ic "janus remote-serve /srv/proj"'`);
  });

  it('keeps the user@host destination outside the quoted command, as ssh\'s own argument', () => {
    expect(remoteServeCommand(address('admin@devbox')))
      .toBe(`ssh -t admin@devbox '$SHELL -ic "janus remote-serve"'`);
  });

  // Single quotes, so the local `$SHELL -lc` that spawnPty builds cannot expand `$SHELL` before ssh
  // sees it: the expansion has to happen on the remote, where the user's own shell is.
  it('leaves $SHELL single-quoted for the remote to expand', () => {
    expect(remoteServeCommand(address('devbox'))).toContain(`'$SHELL -ic`);
  });

  // The inner double quotes are consumed by the remote login shell, so the interactive shell parses
  // `~/dev/proj` unquoted and expands it — as it did before the wrapper existed.
  it('leaves a home-relative path unquoted inside the inner command so the remote expands it', () => {
    expect(remoteServeCommand(address('admin@devbox:~/dev/proj')))
      .toBe(`ssh -t admin@devbox '$SHELL -ic "janus remote-serve ~/dev/proj"'`);
  });
});

function managerHarness() {
  let transport: { onData: (data: string) => void; onExit: () => void } | undefined;
  const kill = vi.fn();
  const reassignTransports = vi.fn();
  const closeTab = vi.fn();
  const managers = {
    pty: {
      spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
        transport = handlers;
        return { id: 'ssh1', program: 'ssh', write: vi.fn(), resize: vi.fn(), kill };
      }),
      reassignTransports,
    },
    tab: { findIndex: vi.fn(() => -1), closeTab, tabs: [], cur: () => ({ label: 'creator' }) },
  } as unknown as Managers;
  const remote = new RemoteManager(managers);
  const handlers: RemoteLaunchHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
  remote.open('creator', address('devbox'), '/local', handlers);
  transport?.onData(`${encodeHandshake('/remote')}\n${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws' })}\n`);
  return { remote, handlers, kill, reassignTransports, closeTab, transport: () => transport };
}

describe('RemoteManager shared channels', () => {
  it('aliases a joined tab onto the existing channel and readiness', async () => {
    const h = managerHarness();
    expect(h.remote.attach('joined', 'creator')).toBe(true);
    expect(h.remote.get('joined')).toBe(h.remote.get('creator'));
    expect(h.remote.workspaceLabelOf('joined')).toBe('creator');
    await expect(h.remote.readyOf('joined')).resolves.toBe('/remote/ws');
  });

  it('keeps the channel after the creator releases and closes it after the last release', () => {
    const h = managerHarness();
    h.remote.attach('joined', 'creator');
    expect(h.remote.release('creator')).toBe(true);
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.reassignTransports).toHaveBeenCalledWith('creator', 'joined');
    expect(h.remote.get('joined')).toBeDefined();
    h.remote.release('joined');
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('notifies every registered owner once when the transport drops', () => {
    const h = managerHarness();
    const joinedHandlers: RemoteLaunchHandlers = {
      onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn(),
    };
    h.remote.attach('joined', 'creator', joinedHandlers);
    h.transport()?.onExit();
    expect(h.handlers.onClosed).toHaveBeenCalledOnce();
    expect(joinedHandlers.onClosed).toHaveBeenCalledOnce();
    expect(h.remote.get('creator')).toBeUndefined();
    expect(h.remote.get('joined')).toBeUndefined();
  });
});
