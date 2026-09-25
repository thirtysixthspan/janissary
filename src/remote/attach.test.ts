import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteManager } from './manager.js';
import { Attach } from './attach.js';
import { encodeFrame, encodeHandshake } from './protocol.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';
import type { Managers } from '../managers.js';
import type { ServerFrame } from './protocol.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));

const sessionId = '12345678-1234-1234-1234-123456789abc';

function setup() {
  const tab = makeTab('work', 'red', 1, [{ input: '', output: 'earlier work' }], [], undefined, 1, 'red');
  tab.log = [{ input: '', output: 'earlier work' }];
  tab.remote = { address: 'devbox', host: 'devbox' };
  tab.view = 'harness';
  tab.harness = { name: 'claude', program: 'claude', ptyId: 'r1', status: 'running' };
  const transports: Array<{ onData: (data: string) => void; onExit: () => void; write: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> }> = [];
  const managers = {
    pty: { spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
      const transport = { ...handlers, write: vi.fn(), kill: vi.fn() };
      transports.push(transport);
      return { id: `ssh${transports.length}`, ...transport };
    }) },
    tab: { tabs: [tab], byLabel: (label: string) => label === tab.label ? tab : undefined, closeTab: vi.fn() },
  } as unknown as Managers;
  const remote = new RemoteManager(managers);
  const handlers = { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() };
  const channel = remote.create(tab.label, { destination: 'devbox', host: 'devbox', address: 'devbox' }, '/local', handlers);
  transports[0].onData(`${encodeHandshake(sessionId)}\n`);
  const frame = (value: ServerFrame) => transports.at(-1)!.onData(`${encodeFrame(value)}\n`);
  frame({ type: 'workspace-ready', dir: '/remote/work' });
  return { tab, remote, channel, managers, handlers, transports, frame };
}

describe('remote attachment', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); messageBus.clear(); });

  it('replaces SSH, retains the channel and cache, and accepts the existing peer', () => {
    const h = setup();
    const output = vi.fn(), reply = vi.fn(), closed = vi.fn();
    h.channel.attach('r1', { onOutput: output, onExit: vi.fn() });
    h.channel.attachNavigator('files', { onReply: reply, onEvent: vi.fn(), onClose: closed });
    h.transports[0].onExit();
    expect(h.channel.attached).toBe(false);
    expect(h.handlers.onClosed).not.toHaveBeenCalled();
    expect(clearRemoteFileCacheForWorkspace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(h.transports).toHaveLength(2);
    expect(h.remote.get('work')).toBe(h.channel);
    h.transports[1].onData(`${encodeHandshake('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')}\n`);
    expect(h.transports[1].write).toHaveBeenCalledExactlyOnceWith(`${encodeFrame({ type: 'attach', session: sessionId })}\n`);
    h.channel.send({ type: 'input', id: 'r1', data: 'discard' });
    expect(h.transports[1].write).toHaveBeenCalledTimes(1);
    h.frame({ type: 'attach-result', accepted: true });
    h.frame({ type: 'output', id: 'r1', data: 'alive' });
    h.frame({ type: 'filesystem-reply', session: 'files', request: 'q', result: [] });
    expect(output).toHaveBeenCalledWith('alive'); expect(reply).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    h.transports[0].onExit(); vi.advanceTimersByTime(60_000);
    expect(h.transports).toHaveLength(2);
    h.remote.dispose();
  });

  it('leaves a harness tab\'s log untouched on a truncated replay', () => {
    const h = setup(); h.transports[0].onExit(); vi.advanceTimersByTime(250);
    h.transports[1].onData(`${encodeHandshake(sessionId)}\n`);
    const before = h.tab.log.length;
    h.frame({ type: 'attach-result', accepted: true, truncated: true });
    expect(h.tab.log.length).toBe(before);
    h.remote.dispose();
  });

  it('appends a drop notice to a non-harness tab\'s log on a truncated replay', () => {
    const h = setup(); h.tab.view = 'agent'; h.tab.harness = undefined;
    h.transports[0].onExit(); vi.advanceTimersByTime(250);
    h.transports[1].onData(`${encodeHandshake(sessionId)}\n`);
    h.frame({ type: 'attach-result', accepted: true, truncated: true });
    expect(h.tab.log.at(-1)?.output).toContain('dropped to limit memory use');
    h.remote.dispose();
  });

  it('keeps retrying an unreachable peer without declaring it ended', () => {
    const h = setup(); h.transports[0].onExit();
    for (let attempt = 0; attempt < 8; attempt++) { vi.advanceTimersByTime(30_000); h.transports.at(-1)!.onExit(); }
    expect(h.transports.length).toBeGreaterThan(5);
    expect(h.tab.harness?.status).toBe('running');
    expect(notify).not.toHaveBeenCalled(); expect(clearRemoteFileCacheForWorkspace).not.toHaveBeenCalled();
    h.remote.dispose();
  });

  it('stops on refusal, retains the ended tab and transcript, and notifies exactly once', () => {
    const h = setup(); h.transports[0].onExit(); vi.advanceTimersByTime(250);
    h.transports[1].onData(`${encodeHandshake(sessionId)}\n`);
    h.frame({ type: 'attach-result', accepted: false });
    h.transports[1].onExit(); vi.advanceTimersByTime(60_000);
    expect(h.transports).toHaveLength(2);
    expect(h.tab.harness).toMatchObject({ status: 'exited', sessionTerminated: 'Remote janus on devbox terminated — create a new agent or shell to continue.' });
    expect(h.tab.log[0].output).toBe('earlier work');
    expect(h.managers.tab.closeTab).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce(); expect(clearRemoteFileCacheForWorkspace).toHaveBeenCalledOnce();
    expect(h.remote.get('work')?.attached).toBe(false);
    h.remote.dispose();
  });

  it.each([true, false])('reports a terminated process with harness=%s and never recreates it', (harness) => {
    const h = setup();
    if (!harness) { h.tab.view = 'agent'; h.tab.harness = undefined; }
    const exited = vi.fn(); h.channel.attach('r1', { onOutput: vi.fn(), onExit: exited });
    h.channel.send({ type: 'spawn', id: 'r1', program: 'work', command: 'work', mode: harness ? 'pty' : 'pipe',
      harness: harness ? 'claude' : undefined, agentName: 'work', cols: 80, rows: 24 });
    h.frame({ type: 'exit', id: 'r1', exitCode: 3 });
    h.frame({ type: 'exit', id: 'r1', exitCode: 3 });
    h.transports[0].onExit(); vi.advanceTimersByTime(60_000);
    expect(exited).toHaveBeenCalledExactlyOnceWith(3);
    expect(h.tab.sessionTerminated).toContain(harness ? "Remote harness 'work'" : 'Remote shell');
    expect(notify).toHaveBeenCalledOnce(); expect(clearRemoteFileCacheForWorkspace).toHaveBeenCalledOnce();
    expect(h.managers.tab.closeTab).not.toHaveBeenCalled(); expect(h.transports).toHaveLength(1);
    h.remote.dispose();
  });

  it('leaves the cache and channel intact when one process ends but a joined tab is still live', () => {
    const tab = makeTab('work', 'red', 1, [], [], undefined, 1, 'red');
    tab.remote = { address: 'devbox', host: 'devbox' };
    tab.view = 'harness';
    tab.harness = { name: 'claude', program: 'claude', ptyId: 'r1', status: 'running' };
    const joined = makeTab('joined', 'blue', 2, [], [], undefined, 1, 'blue');
    joined.remote = { address: 'devbox', host: 'devbox' };
    joined.view = 'agent';
    const transports: Array<{ onData: (data: string) => void; onExit: () => void }> = [];
    const managers = {
      pty: { spawnTransport: vi.fn((_label, _program, _command, _cwd, handlers) => {
        transports.push(handlers);
        return { id: 'ssh1', write: vi.fn(), kill: vi.fn() };
      }) },
      tab: {
        tabs: [tab, joined],
        byLabel: (label: string) => [tab, joined].find((t) => t.label === label),
        closeTab: vi.fn(),
      },
    } as unknown as Managers;
    const remote = new RemoteManager(managers);
    const channel = remote.create('work', { destination: 'devbox', host: 'devbox', address: 'devbox' }, '/local',
      { onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn() });
    transports[0].onData(`${encodeHandshake(sessionId)}\n`);
    const frame = (value: ServerFrame) => transports.at(-1)!.onData(`${encodeFrame(value)}\n`);
    frame({ type: 'workspace-ready', dir: '/remote/work' });
    expect(remote.attach('joined', 'work')).toBe(true);
    channel.attach('r1', { onOutput: vi.fn(), onExit: vi.fn() });
    channel.send({ type: 'spawn', id: 'r1', program: 'work', command: 'work', mode: 'pty',
      harness: 'claude', agentName: 'work', cols: 80, rows: 24 });
    frame({ type: 'exit', id: 'r1', exitCode: 3 });
    expect(tab.sessionTerminated).toContain("Remote harness 'work'");
    expect(joined.sessionTerminated).toBeUndefined();
    expect(clearRemoteFileCacheForWorkspace).not.toHaveBeenCalled();
    expect(channel.attached).toBe(true);
    remote.dispose();
  });

  it.each([true, false])('does not report a locally requested kill as a termination, harness=%s', (harness) => {
    const h = setup();
    if (!harness) { h.tab.view = 'agent'; h.tab.harness = undefined; }
    const exited = vi.fn(); h.channel.attach('r1', { onOutput: vi.fn(), onExit: exited });
    h.channel.send({ type: 'spawn', id: 'r1', program: 'work', command: 'work', mode: harness ? 'pty' : 'pipe',
      harness: harness ? 'claude' : undefined, agentName: 'work', cols: 80, rows: 24 });
    h.channel.send({ type: 'kill', id: 'r1' });
    h.frame({ type: 'exit', id: 'r1', exitCode: 0 });
    expect(exited).toHaveBeenCalledExactlyOnceWith(0);
    expect(notify).not.toHaveBeenCalled();
    expect(h.tab.sessionTerminated).toBeUndefined();
    expect(h.transports[0].kill).not.toHaveBeenCalled();
    h.remote.dispose();
  });

  it('leaves an attached channel alone on system resume', () => {
    const h = setup();
    messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
    expect(h.transports).toHaveLength(1);
    expect(h.transports[0].kill).not.toHaveBeenCalled();
    h.remote.dispose();
  });

  it('collapses the backoff wait immediately on system resume once a transport is already lost', () => {
    const h = setup();
    h.transports[0].onExit();
    messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
    expect(h.transports).toHaveLength(2);
    h.remote.dispose();
    messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
    expect(h.transports).toHaveLength(2);
  });

  it('retries a failed transport spawn and cancels all timers on stop', () => {
    const connect = vi.fn(() => { throw new Error('spawn failed'); });
    const retry = new Attach(connect, vi.fn());
    retry.lost(); vi.advanceTimersByTime(10_000);
    expect(connect.mock.calls.length).toBeGreaterThan(1);
    retry.stop(); const count = connect.mock.calls.length;
    vi.advanceTimersByTime(60_000); expect(connect).toHaveBeenCalledTimes(count);
  });
});
