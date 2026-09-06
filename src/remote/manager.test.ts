import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteManager, remoteServeCommand, type RemoteLaunchHandlers } from './manager.js';
import { parseRemoteAddress, type RemoteAddress } from './address.js';
import { encodeFrame, encodeHandshake } from './protocol.js';
import { notify } from '../notifications.js';
import { writeBrowserLog } from '../browser/browser-log.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

vi.mock('../notifications.js', () => ({ notify: vi.fn() }));
vi.mock('../browser/browser-log.js', () => ({ writeBrowserLog: vi.fn(() => '/local/.janissary/browser-logs/creator-now.log') }));

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

// A remote `-b` tab's browser dying is reported by the far side as a `browser-exited` frame. The
// tab it names is resolved from the frame's session id, not the channel's label — joined tabs share
// a channel, so the channel label would name the wrong one.
function browserHarness(tabs: Tab[]) {
  let transport: { onData: (data: string) => void; onExit: () => void } | undefined;
  const closeTab = vi.fn();
  const append = vi.fn();
  const managers = {
    pty: {
      spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
        transport = handlers;
        return { id: 'ssh1', program: 'ssh', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
      }),
      reassignTransports: vi.fn(),
    },
    tab: { findIndex: vi.fn(() => -1), closeTab, append, tabs, cur: () => ({ label: 'creator' }) },
  } as unknown as Managers;
  const remote = new RemoteManager(managers);
  remote.open('creator', address('devbox'), '/local', { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() });
  transport?.onData(`${encodeHandshake('/remote')}\n${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws' })}\n`);
  return {
    managers,
    closeTab,
    append,
    send: (id: string, message?: string, log?: string) => transport?.onData(
      `${encodeFrame({
        type: 'browser-exited', id,
        ...(message !== undefined && { message }),
        ...(log !== undefined && { log }),
      })}\n`,
    ),
  };
}

function harnessTab(label: string, ptyId: string): Tab {
  return { label, harness: { name: 'claude', program: 'claude', ptyId, status: 'running' } } as unknown as Tab;
}

describe('RemoteManager browser-exited frames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies against the tab owning that session id', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);
    h.send('rpty1');
    expect(notify).toHaveBeenCalledWith(
      h.managers, 'e2e-browser-gone', 'creator', expect.stringContaining('remote'), undefined,
    );
  });

  // The channel label is `creator`; naming the tab from it would report the wrong tab entirely.
  it('names the joined tab that owns the session, not the channel\'s own label', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1'), harnessTab('joined', 'rpty2')]);
    h.send('rpty2');
    expect(notify).toHaveBeenCalledWith(
      h.managers, 'e2e-browser-gone', 'joined', expect.any(String), undefined,
    );
  });

  it('drops a frame for an already-closed tab', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);
    h.send('gone-session');
    expect(notify).not.toHaveBeenCalled();
  });

  // The frame is a report about the tab, not a channel-level fault: it must not tear the transport
  // down the way an unexpected frame would.
  it('keeps the channel open', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);
    h.send('rpty1');
    expect(h.closeTab).not.toHaveBeenCalled();
  });

  // Only the far side saw the browser's own output, so what it composed is what the tab is told —
  // the fixed string is a fallback for a frame that carries nothing, not a replacement for one.
  it('reports the message the remote composed', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);
    h.send('rpty1', 'e2e browser exited\nlaunch failed: no such executable');
    expect(notify).toHaveBeenCalledWith(
      h.managers, 'e2e-browser-gone', 'creator', 'e2e browser exited\nlaunch failed: no such executable', undefined,
    );
  });

  // The far side is where the browser died, but the link on the notification opens an editor tab
  // here — so the file it points at has to be written on this machine, from what the frame carried.
  it('writes the log the frame carried and links it from the notification', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);

    h.send('rpty1', 'e2e browser exited (signal SIGSEGV)', 'e2e browser exited (signal SIGSEGV)\n#0 frame');

    expect(writeBrowserLog).toHaveBeenCalledWith(
      'creator', expect.any(Number), 'e2e browser exited (signal SIGSEGV)\n#0 frame',
    );
    expect(notify).toHaveBeenCalledWith(
      h.managers, 'e2e-browser-gone', 'creator', 'e2e browser exited (signal SIGSEGV)',
      '/local/.janissary/browser-logs/creator-now.log',
    );
  });

  // Named for the tab that owns the session, like the notification itself — a joined tab's log must
  // not land under the channel's label.
  it('names the log for the tab that owns the session', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1'), harnessTab('joined', 'rpty2')]);

    h.send('rpty2', 'e2e browser exited', 'e2e browser exited\n#0 frame');

    expect(writeBrowserLog).toHaveBeenCalledWith('joined', expect.any(Number), expect.any(String));
  });

  it('writes no log for a frame that carried none', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);

    h.send('rpty1', 'e2e browser exited');

    expect(writeBrowserLog).not.toHaveBeenCalled();
  });

  it('still notifies when the log could not be written', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1')]);
    vi.mocked(writeBrowserLog).mockReturnValueOnce(undefined);

    h.send('rpty1', 'e2e browser exited', 'e2e browser exited\n#0 frame');

    expect(notify).toHaveBeenCalledWith(
      h.managers, 'e2e-browser-gone', 'creator', 'e2e browser exited', undefined,
    );
  });

  // A harness tab's body is its PTY and nothing renders its log, so the report rides the harness
  // view the way a failed workspace clone does — not the transcript the notifications feed uses.
  it('puts the report on the tab itself, not only in the notifications feed', () => {
    const tab = harnessTab('creator', 'rpty1');
    const h = browserHarness([tab]);
    h.send('rpty1', 'e2e browser exited\nlaunch failed');
    expect(tab.harness?.browserError).toBe('e2e browser exited\nlaunch failed');
    expect(h.append).not.toHaveBeenCalled();
  });

  it('falls back to naming the remote when the frame carries no message', () => {
    const tab = harnessTab('creator', 'rpty1');
    browserHarness([tab]).send('rpty1');
    expect(tab.harness?.browserError).toBe('e2e browser stopped on the remote host');
  });

  it('reports nothing on a tab the frame does not name', () => {
    const tab = harnessTab('creator', 'rpty1');
    browserHarness([tab]).send('gone-session', 'e2e browser exited');
    expect(tab.harness?.browserError).toBeUndefined();
  });
});
