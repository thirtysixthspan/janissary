import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteManager, remoteServeCommand, type RemoteLaunchHandlers } from './manager.js';
import { remoteCaptureCommand } from './entry-factory.js';
import { parseRemoteAddress, type RemoteAddress } from './address.js';
import { encodeFrame, encodeHandshake } from './protocol.js';
import { notify } from '../notifications/index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';
import { REMOTE_SHUTDOWN_DRAIN_MS } from './shutdown-drain.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));

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

describe('remoteCaptureCommand', () => {
  it('disables interactive SSH authentication while retaining the remote shell command', () => {
    expect(remoteCaptureCommand(address('devbox:/srv/proj')))
      .toBe(`ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o ConnectTimeout=10 -t devbox '$SHELL -ic "janus remote-serve /srv/proj"'`);
  });
});

function managerHarness(ready = true, session?: string) {
  let transport: { onData: (data: string) => void; onExit: () => void } | undefined;
  const kill = vi.fn();
  const write = vi.fn();
  const reassignTransports = vi.fn();
  const closeTab = vi.fn();
  const dropSession = vi.fn();
  const managers = {
    pty: {
      spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
        transport = handlers;
        return { id: 'ssh1', program: 'ssh', write, resize: vi.fn(), kill };
      }),
      reassignTransports,
    },
    sessions: { dropSession },
    tab: {
      findIndex: vi.fn(() => -1),
      closeTab,
      tabs: [],
      byLabel: vi.fn(),
      cur: () => ({ label: 'creator' }),
    },
  } as unknown as Managers;
  const remote = new RemoteManager(managers);
  const handlers: RemoteLaunchHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn(), onNameRefused: vi.fn() };
  remote.create('creator', address('devbox'), '/local', handlers);
  transport?.onData(`${encodeHandshake('/remote', session)}\n`);
  if (ready) transport?.onData(`${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws' })}\n`);
  return { remote, handlers, kill, write, reassignTransports, closeTab, dropSession, transport: () => transport };
}

describe('RemoteManager shared channels', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('retains joined tabs and cached files when an established peer transport drops', () => {
    vi.useFakeTimers();
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    h.remote.attach('joined', 'creator');
    const channel = h.remote.get('creator');
    h.transport()?.onExit();
    expect(h.remote.get('joined')).toBe(channel);
    expect(h.remote.workspaceOf('joined')).toBe('/remote/ws');
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
    expect(clearRemoteFileCacheForWorkspace).not.toHaveBeenCalled();
    h.remote.dispose();
  });

  it('detaches survivors before callbacks after creator release and repeated exit', () => {
    const h = managerHarness();
    const onClosed = vi.fn(() => {
      expect(h.remote.get('joined')).toBeUndefined();
      expect(h.remote.release('joined')).toBe(false);
      h.transport()?.onExit();
    });
    h.remote.attach('joined', 'creator', { onReady: vi.fn(), onFailed: vi.fn(), onClosed });
    h.remote.release('creator');
    h.transport()?.onExit();
    h.transport()?.onExit();
    expect(onClosed).toHaveBeenCalledOnce();
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
    expect(h.remote.readyOf('joined')).toBeUndefined();
    expect(h.remote.addressOf('joined')).toBeUndefined();
    expect(h.remote.transcriptSource('joined')).toBeUndefined();
    expect(clearRemoteFileCacheForWorkspace).toHaveBeenCalledExactlyOnceWith('devbox', 'creator');
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'remote-session-terminated', 'joined', expect.any(String));
  });

  it('keeps readiness and teardown on the old entry after creator-label reuse', async () => {
    const h = managerHarness(false);
    const oldTransport = h.transport();
    h.remote.attach('joined', 'creator');
    const oldReady = h.remote.readyOf('joined');
    h.remote.release('creator');
    const replacementHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
    const replacement = h.remote.create('creator', address('otherhost'), '/local', replacementHandlers);
    oldTransport?.onData(`${encodeFrame({ type: 'workspace-ready', dir: '/old/ws' })}\n`);
    await expect(oldReady).resolves.toBe('/old/ws');
    expect(h.remote.workspaceOf('creator')).toBeUndefined();
    expect(h.handlers.onReady).not.toHaveBeenCalled();
    oldTransport?.onExit();
    oldTransport?.onExit();
    expect(h.remote.get('joined')).toBeUndefined();
    expect(h.remote.get('creator')).toBe(replacement);
    expect(replacementHandlers.onClosed).not.toHaveBeenCalled();
    h.transport()?.onData(`${encodeHandshake('/new')}\n${encodeFrame({ type: 'workspace-ready', dir: '/new/ws' })}\n`);
    await expect(h.remote.readyOf('creator')).resolves.toBe('/new/ws');
  });

  it.each(['workspace failure', 'protocol error'])('isolates %s after creator-label reuse', async (failure) => {
    const h = managerHarness(false);
    const oldTransport = h.transport();
    h.remote.attach('joined', 'creator');
    const oldReady = h.remote.readyOf('joined');
    h.remote.release('creator');
    const replacementHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
    h.remote.create('creator', address('otherhost'), '/local', replacementHandlers);
    // A frame outside the union, not a line that simply is not one: far-side output the remote
    // printed rather than framed is ignored now, so it would fault nothing to isolate.
    oldTransport?.onData(failure === 'workspace failure'
      ? `${encodeFrame({ type: 'workspace-failed', message: 'provision failed' })}\n`
      : `${JSON.stringify({ type: 'exec', id: 'r1' })}\n`);
    await expect(oldReady).rejects.toThrow();
    expect(h.handlers.onFailed).not.toHaveBeenCalled();
    expect(replacementHandlers.onFailed).not.toHaveBeenCalled();
    h.transport()?.onData(`${encodeHandshake('/new')}\n${encodeFrame({ type: 'workspace-ready', dir: '/new/ws' })}\n`);
    await expect(h.remote.readyOf('creator')).resolves.toBe('/new/ws');
  });

  it('settles readiness and reaches onNameRefused, not onFailed, on a name-in-use answer', async () => {
    const h = managerHarness(false);
    const ready = h.remote.readyOf('creator');
    h.transport()?.onData(`${encodeFrame({ type: 'name-in-use', label: 'creator' })}\n`);
    await expect(ready).rejects.toThrow('"creator" is in use on devbox');
    expect(h.handlers.onNameRefused).toHaveBeenCalledWith({ type: 'name-in-use', label: 'creator' });
    expect(h.handlers.onFailed).not.toHaveBeenCalled();
    h.remote.release('creator');
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
  });

  // The far side answers every refusal with `workspace-failed`. Once the workspace is ready that frame
  // is one turned-away request, not a failed launch, so it must not reach the handler that closes the tab.
  it('reports a refusal after workspace-ready and keeps the tab and channel open', () => {
    const h = managerHarness();
    const channel = h.remote.get('creator');
    h.transport()?.onData(`${encodeFrame({ type: 'workspace-failed', message: 'Unexpected remote frame "capture-request".' })}\n`);
    expect(h.handlers.onFailed).not.toHaveBeenCalled();
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
    expect(h.closeTab).not.toHaveBeenCalled();
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.remote.get('creator')).toBe(channel);
    expect(h.remote.workspaceOf('creator')).toBe('/remote/ws');
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'remote-refused', 'creator',
      'Remote janus on devbox refused a request: Unexpected remote frame "capture-request".');
  });

  it('reports a post-ready refusal on a surviving joined tab once the creator is released', () => {
    const h = managerHarness();
    h.remote.attach('joined', 'creator');
    h.remote.release('creator');
    h.transport()?.onData(`${encodeFrame({ type: 'workspace-failed', message: 'No remote workspace has been provisioned.' })}\n`);
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'remote-refused', 'joined', expect.stringContaining('devbox'));
    expect(h.remote.get('joined')).toBeDefined();
  });

  it('still fails the launch on a refusal before workspace-ready, without a refusal report', async () => {
    const h = managerHarness(false);
    const ready = h.remote.readyOf('creator');
    h.transport()?.onData(`${encodeFrame({ type: 'workspace-failed', message: 'provision failed' })}\n`);
    await expect(ready).rejects.toThrow('provision failed');
    expect(h.handlers.onFailed).toHaveBeenCalledExactlyOnceWith('provision failed');
    expect(notify).not.toHaveBeenCalled();
  });

  it('hands a removed leftover\'s path to onReady', () => {
    const h = managerHarness(false);
    h.transport()?.onData(`${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws', cleaned: '/remote/ws' })}\n`);
    expect(h.handlers.onReady).toHaveBeenCalledWith('/remote/ws', undefined, '/remote/ws');
  });

  it('settles readiness and clears the cache once on final-owner release', async () => {
    const h = managerHarness(false);
    const ready = h.remote.readyOf('creator');
    h.remote.release('creator');
    await expect(ready).rejects.toThrow('ended before its workspace was ready');
    h.transport()?.onExit();
    expect(clearRemoteFileCacheForWorkspace).toHaveBeenCalledOnce();
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
  });

  // What the metadata row's attach control is offered from. Read off the channel rather than
  // marked onto the tab, so it cannot report a recovery that has already finished.
  it('reports a channel mid-backoff as reconnecting and a healthy one as not', () => {
    vi.useFakeTimers();
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    expect(h.remote.reconnectingOf('creator')).toBe(false);
    expect(h.remote.reconnectingOf('nothing-here')).toBe(false);
    h.transport()?.onExit();
    expect(h.remote.reconnectingOf('creator')).toBe(true);
    h.remote.dispose();
  });

  it('aliases a joined tab onto the existing channel and readiness', async () => {
    const h = managerHarness();
    expect(h.remote.attach('joined', 'creator')).toBe(true);
    expect(h.remote.get('joined')).toBe(h.remote.get('creator'));
    expect(h.remote.workspaceLabelOf('joined')).toBe('creator');
    await expect(h.remote.readyOf('joined')).resolves.toBe('/remote/ws');
  });

  it('keeps the channel after the creator releases and closes it after the last release', () => {
    vi.useFakeTimers();
    const h = managerHarness();
    h.remote.attach('joined', 'creator');
    expect(h.remote.release('creator')).toBe(true);
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.reassignTransports).toHaveBeenCalledWith('creator', 'joined');
    expect(h.remote.get('joined')).toBeDefined();
    h.remote.release('joined');
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('drains a shutdown frame before killing the transport on the last release', () => {
    vi.useFakeTimers();
    const h = managerHarness();
    h.remote.release('creator');
    const shutdownIndex = h.write.mock.calls.findIndex(([data]: [string]) => data.includes('"type":"shutdown"'));
    expect(shutdownIndex).toBeGreaterThanOrEqual(0);
    expect(h.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
    expect(h.kill.mock.invocationCallOrder[0]).toBeGreaterThan(h.write.mock.invocationCallOrder[shutdownIndex]);
  });

  // The session record outlives a launch so it can be attached or ended — but not outlive the
  // session itself. Without the drop, a closed harness leaves a detached row behind a peer that was
  // actually shut down, and the same session reads as two lines in the list.
  it('drops the session record when the last release ends the channel', () => {
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    h.remote.release('creator');
    expect(h.dropSession).toHaveBeenCalledWith('12345678-1234-1234-1234-123456789abc');
  });

  it('drops no record when the channel was never given a session id', () => {
    const h = managerHarness();
    h.remote.release('creator');
    expect(h.dropSession).not.toHaveBeenCalled();
  });

  it('drops the session record on an explicit close', () => {
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    h.remote.close('creator');
    expect(h.dropSession).toHaveBeenCalledWith('12345678-1234-1234-1234-123456789abc');
  });

  it('drains a shutdown frame before killing every transport on closeAll', () => {
    vi.useFakeTimers();
    const h = managerHarness();
    h.remote.closeAll();
    const shutdownIndex = h.write.mock.calls.findIndex(([data]: [string]) => data.includes('"type":"shutdown"'));
    expect(shutdownIndex).toBeGreaterThanOrEqual(0);
    expect(h.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
    expect(h.kill.mock.invocationCallOrder[0]).toBeGreaterThan(h.write.mock.invocationCallOrder[shutdownIndex]);
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

  // `connection close ssh:<id>` is the user ending the session, not something that happened to it,
  // so the tabs go rather than sitting open in an exited state and the feed records nothing.
  it('closes every tab on the channel without announcing an ended session', () => {
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    const joinedHandlers: RemoteLaunchHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
    h.remote.attach('joined', 'creator', joinedHandlers);
    expect(h.remote.close('creator')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(h.handlers.onClosed).toHaveBeenCalledOnce();
    expect(joinedHandlers.onClosed).toHaveBeenCalledOnce();
    expect(h.remote.get('creator')).toBeUndefined();
    expect(h.remote.get('joined')).toBeUndefined();
  });

  // The sessions list has to notice a launch, a workspace arriving, a process starting, a join, and
  // a release on its own. Waiting for Refresh made an open list look live while saying nothing, and
  // a session launched with the tab shut was never recorded at all.
  it('signals the sessions channel at every move of the live set', () => {
    let signals = 0;
    const subscription = messageBus.on('sessions', 'changed', () => { signals += 1; });
    try {
      const h = managerHarness(false);
      const afterOpen = signals;
      expect(afterOpen).toBeGreaterThan(0);

      h.transport()?.onData(`${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws' })}\n`);
      const afterReady = signals;
      expect(afterReady).toBeGreaterThan(afterOpen);

      h.remote.get('creator')?.send({
        type: 'spawn', id: 'rpty1', program: 'claude', command: 'claude',
        mode: 'pty', harness: 'claude', cols: 80, rows: 24,
      });
      const afterSpawn = signals;
      expect(afterSpawn).toBeGreaterThan(afterReady);

      h.remote.attach('joined', 'creator');
      const afterAttach = signals;
      expect(afterAttach).toBeGreaterThan(afterSpawn);

      h.remote.release('joined');
      expect(signals).toBeGreaterThan(afterAttach);
    } finally {
      subscription.unsubscribe();
    }
  });

  // The opposite of `detach`: an explicit close finishes the peer off instead of parking it.
  it('drains a shutdown frame on an explicit close before killing the transport', () => {
    vi.useFakeTimers();
    const h = managerHarness(true, '12345678-1234-1234-1234-123456789abc');
    h.remote.close('creator');
    const shutdownIndex = h.write.mock.calls.findIndex(([data]: [string]) => data.includes('"type":"shutdown"'));
    expect(shutdownIndex).toBeGreaterThanOrEqual(0);
    expect(h.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
    expect(h.kill.mock.invocationCallOrder[0]).toBeGreaterThan(h.write.mock.invocationCallOrder[shutdownIndex]);
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
    tab: {
      findIndex: vi.fn(() => -1),
      closeTab,
      append,
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      harnessTabByPtyId: (ptyId: string) => tabs.find((t) => t.harness?.ptyId === ptyId),
      cur: () => ({ label: 'creator' }),
    },
  } as unknown as Managers;
  const remote = new RemoteManager(managers);
  remote.create('creator', address('devbox'), '/local', { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() });
  transport?.onData(`${encodeHandshake('/remote')}\n${encodeFrame({ type: 'workspace-ready', dir: '/remote/ws' })}\n`);
  return {
    managers,
    closeTab,
    append,
    send: (id: string, message?: string) => transport?.onData(
      `${encodeFrame({ type: 'browser-exited', id, ...(message !== undefined && { message }) })}\n`,
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
    expect(notify).toHaveBeenCalledWith(h.managers, 'e2e-browser-gone', 'creator', expect.stringContaining('remote'));
  });

  // The channel label is `creator`; naming the tab from it would report the wrong tab entirely.
  it('names the joined tab that owns the session, not the channel\'s own label', () => {
    const h = browserHarness([harnessTab('creator', 'rpty1'), harnessTab('joined', 'rpty2')]);
    h.send('rpty2');
    expect(notify).toHaveBeenCalledWith(h.managers, 'e2e-browser-gone', 'joined', expect.any(String));
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
      h.managers, 'e2e-browser-gone', 'creator', 'e2e browser exited\nlaunch failed: no such executable',
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

const RECORDED_SESSION = '12345678-1234-1234-1234-123456789abc';

// Opening with a record is an attach, and the whole point is that it is the same routine: the
// channel carries the session id from the start, so the handshake asks to attach instead of asking
// for a clone nobody wants a second copy of.
describe('RemoteManager attach from a record', () => {
  beforeEach(() => vi.clearAllMocks());

  function resumeHarness() {
    let transport: { onData: (data: string) => void; onExit: () => void } | undefined;
    const write = vi.fn();
    const kill = vi.fn();
    const managers = {
      pty: {
        spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
          transport = handlers;
          return { id: 'ssh1', program: 'ssh', write, resize: vi.fn(), kill };
        }),
        reassignTransports: vi.fn(),
      },
      tab: { findIndex: vi.fn(() => -1), closeTab: vi.fn(), tabs: [], byLabel: vi.fn(), cur: () => ({ label: 'creator' }) },
    } as unknown as Managers;
    const remote = new RemoteManager(managers);
    const handlers: RemoteLaunchHandlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
    const onResult = vi.fn();
    remote.create('creator', address('devbox'), '/remote/ws', handlers, {
      session: RECORDED_SESSION, workspaceDir: '/remote/ws', onResult,
    });
    return { remote, handlers, onResult, write, kill, spawnTransport: managers.pty.spawnTransport, transport: () => transport };
  }

  it('starts resumed SSH locally while restoring the remote workspace on acceptance', async () => {
    const h = resumeHarness();
    expect(h.spawnTransport).toHaveBeenCalledWith(
      'creator', 'ssh', expect.any(String), process.cwd(), expect.any(Object),
    );
    h.transport()?.onData(`${encodeHandshake('/remote', RECORDED_SESSION)}\n`);
    h.transport()?.onData(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
    await expect(h.remote.readyOf('creator')).resolves.toBe('/remote/ws');
    expect(h.handlers.onReady).toHaveBeenCalledWith('/remote/ws');
    h.remote.dispose();
  });

  it('sends attach carrying the recorded session id, and never provision', () => {
    const h = resumeHarness();
    h.transport()?.onData(`${encodeHandshake('/remote', RECORDED_SESSION)}\n`);
    const sent = h.write.mock.calls.map(([data]: [string]) => JSON.parse(String(data).trim()) as { type: string });
    expect(sent.map((frame) => frame.type)).toEqual(['attach']);
    expect(sent[0]).toEqual({ type: 'attach', session: RECORDED_SESSION, restore: true });
  });

  // No `workspace-ready` ever comes for an attach, so the recorded directory is what settles the
  // placeholder tab. Without it the tab would sit as a placeholder and close over a live session.
  it('settles the tab from the recorded workspace directory on an accepted attach', async () => {
    const h = resumeHarness();
    h.transport()?.onData(`${encodeHandshake('/remote', RECORDED_SESSION)}\n`);
    h.transport()?.onData(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);

    await expect(h.remote.readyOf('creator')).resolves.toBe('/remote/ws');
    expect(h.remote.workspaceOf('creator')).toBe('/remote/ws');
    expect(h.handlers.onReady).toHaveBeenCalledWith('/remote/ws');
    expect(h.onResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  // A peer that answers is a peer that is there; refusing establishes the session is over, which is
  // a different fact from an unreachable host and has to be reported as one.
  it('reports a refused attach as refused rather than retrying it', () => {
    const h = resumeHarness();
    h.transport()?.onData(`${encodeHandshake('/remote', RECORDED_SESSION)}\n`);
    h.transport()?.onData(`${encodeFrame({ type: 'attach-result', accepted: false })}\n`);

    expect(h.onResult).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('answers the caller once, leaving a later transport loss to the ordinary reconnect path', () => {
    const h = resumeHarness();
    h.transport()?.onData(`${encodeHandshake('/remote', RECORDED_SESSION)}\n`);
    h.transport()?.onData(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
    h.transport()?.onData(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);

    expect(h.onResult).toHaveBeenCalledTimes(1);
    h.remote.dispose();
  });

  it('asks for a clone when no record is supplied, exactly as before', () => {
    const h = managerHarness(false);
    const sent = h.write.mock.calls.map(([data]: [string]) => JSON.parse(String(data).trim()) as { type: string });
    expect(sent.map((frame) => frame.type)).toEqual(['provision']);
  });
});

describe('RemoteManager detach', () => {
  beforeEach(() => vi.clearAllMocks());

  // The frames `finish()` sends are exactly what a detach must not send: `kill` stops the processes
  // and `shutdown` removes the remote workspace, which is the session the user asked to keep.
  it('drops the transport without sending kill, acp-close, or shutdown', () => {
    const h = managerHarness(true, RECORDED_SESSION);
    h.write.mockClear();

    expect(h.remote.detach('creator')).toBe(true);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.kill).toHaveBeenCalled();
  });

  it('releases every label riding the channel', () => {
    const h = managerHarness(true, RECORDED_SESSION);
    h.remote.attach('joined', 'creator');
    expect([...h.remote.liveEntries()[0].labels]).toEqual(['creator', 'joined']);

    h.remote.detach('creator');
    expect(h.remote.get('creator')).toBeUndefined();
    expect(h.remote.get('joined')).toBeUndefined();
  });

  // The tab-close walk runs after the detach and must find nothing: a `release` that still saw the
  // entry would take the last-label branch and send the shutdown the detach withheld.
  it('leaves the tab-close walk nothing to release', () => {
    const h = managerHarness(true, RECORDED_SESSION);
    h.remote.detach('creator');
    h.write.mockClear();

    expect(h.remote.release('creator')).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('reports no session-ended line, since the session did not end', () => {
    const h = managerHarness(true, RECORDED_SESSION);
    h.remote.detach('creator');
    expect(notify).not.toHaveBeenCalled();
  });

  // Decision 12: a session still provisioning has nothing to come back to, which is the same test
  // the automatic recovery applies before treating a lost transport as recoverable.
  it('refuses a session whose workspace is not ready', () => {
    const h = managerHarness(false, RECORDED_SESSION);
    expect(h.remote.detach('creator')).toBe(false);
    expect(h.remote.get('creator')).toBeDefined();
  });

  it('refuses a session the far side gave no id for', () => {
    const h = managerHarness(true);
    expect(h.remote.detach('creator')).toBe(false);
  });

  it('refuses a label it does not hold', () => {
    const h = managerHarness(true, RECORDED_SESSION);
    expect(h.remote.detach('nothing-here')).toBe(false);
  });
});
