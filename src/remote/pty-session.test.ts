import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRemotePtySession } from './pty-session.js';
import { RemoteChannel, type ChannelTransport } from './channel.js';
import { encodeFrame, encodeHandshake, decodeFrame, type RemoteFrame } from './protocol.js';
import { PseudoterminalManager } from './../pseudoterminal-manager.js';
import { HarnessScreenReader } from '../harness/screen.js';
import { messageBus } from '../bus.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// An attached channel over a fake ssh PTY: `sent` collects the frames the local side writes.
function attachedChannel() {
  const sent: RemoteFrame[] = [];
  const transport: ChannelTransport = {
    id: 'pty1',
    write: (data) => {
      for (const line of data.split('\n')) {
        if (!line) continue;
        const frame = decodeFrame(line);
        if (!('error' in frame)) sent.push(frame);
      }
    },
    kill: vi.fn(),
  };
  const channel = new RemoteChannel(transport, {
    onTerminalData: vi.fn(), onAttached: vi.fn(), onFrame: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
  });
  channel.receive(`${encodeHandshake('/srv/proj')}\n`);
  return { channel, sent };
}

function makeManagers(tabs: Tab[]): Managers {
  return {
    tab: {
      tabs,
      cwdOf: vi.fn(() => '/repo'),
      persist: vi.fn(),
      buildAgentState: vi.fn((tab: Tab) => ({ name: tab.label, dotColor: tab.dotColor, active: true })),
    },
  } as unknown as Managers;
}

describe('createRemotePtySession', () => {
  it('satisfies the PtySession shape, naming the remote binary rather than ssh', () => {
    const { channel } = attachedChannel();
    const session = createRemotePtySession(channel, {
      id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24,
    }, vi.fn());
    expect(session.id).toBe('r1');
    expect(session.program).toBe('claude');
    expect(typeof session.write).toBe('function');
    expect(typeof session.resize).toBe('function');
    expect(typeof session.kill).toBe('function');
  });

  it('sends a spawn frame carrying the program, command, harness, and dimensions', () => {
    const { channel, sent } = attachedChannel();
    createRemotePtySession(channel, {
      id: 'r1', program: 'claude', command: 'claude --model opus', harness: 'claude', offline: true, cols: 100, rows: 40,
    }, vi.fn());
    expect(sent).toEqual([{
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude --model opus',
      mode: 'pty', harness: 'claude', cols: 100, rows: 40, offline: true,
    }]);
  });

  it('sends input, resize, and kill frames for the session id', () => {
    const { channel, sent } = attachedChannel();
    const session = createRemotePtySession(channel, {
      id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24,
    }, vi.fn());
    sent.length = 0;

    session.write('hello');
    session.resize(120, 50);
    session.kill();

    expect(sent).toEqual([
      { type: 'input', id: 'r1', data: 'hello' },
      { type: 'resize', id: 'r1', cols: 120, rows: 50 },
      { type: 'kill', id: 'r1' },
    ]);
  });

  it('clamps a resize to at least one column and row', () => {
    const { channel, sent } = attachedChannel();
    const session = createRemotePtySession(channel, {
      id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24,
    }, vi.fn());
    sent.length = 0;
    session.resize(0, -5);
    expect(sent).toEqual([{ type: 'resize', id: 'r1', cols: 1, rows: 1 }]);
  });

  it('publishes an inbound output frame on the bus under the session id', () => {
    const { channel } = attachedChannel();
    createRemotePtySession(channel, { id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24 }, vi.fn());
    const seen: { id: string; data?: string }[] = [];
    const subscription = messageBus.on('pty', 'data', (event) => {
      if (event.type === 'data') seen.push({ id: event.id, data: event.data });
    });

    channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'remote bytes' })}\n`);
    subscription.unsubscribe();

    expect(seen).toEqual([{ id: 'r1', data: 'remote bytes' }]);
  });

  it('calls the exit callback with the remote exit code', () => {
    const { channel } = attachedChannel();
    const onExit = vi.fn();
    createRemotePtySession(channel, { id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24 }, onExit);
    channel.receive(`${encodeFrame({ type: 'exit', id: 'r1', exitCode: 2 })}\n`);
    expect(onExit).toHaveBeenCalledWith(2);
  });
});

// The point of the whole design: everything already built on a PTY id keeps working when the
// process is on another machine.
describe('a remote PTY inside PseudoterminalManager', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('feeds an attached screen reader, which produces a capture from remote bytes', () => {
    const { channel } = attachedChannel();
    const manager = new PseudoterminalManager(makeManagers([makeTab('claude', 'red')]));
    const id = manager.registerRemotePty('claude', channel, { program: 'claude', command: 'claude' });
    const captures: string[] = [];
    const reader = new HarnessScreenReader(id, 80, 24, (capture) => { captures.push(capture.text.trim()); });

    channel.receive(`${encodeFrame({ type: 'output', id, data: 'remote screen' })}\n`);
    vi.advanceTimersByTime(5000);
    reader.dispose();

    expect(captures.join('\n')).toContain('remote screen');
  });

  it('lists the remote binary as the tab\'s terminal connection', () => {
    const { channel } = attachedChannel();
    const manager = new PseudoterminalManager(makeManagers([makeTab('claude', 'red')]));
    manager.registerRemotePty('claude', channel, { program: 'claude', command: 'claude' });
    expect(manager.terminalsFor('claude')).toEqual(['claude']);
  });

  it('runs the manager\'s own exit handling when an exit frame arrives', () => {
    const { channel } = attachedChannel();
    const tab = makeTab('claude', 'red');
    const manager = new PseudoterminalManager(makeManagers([tab]));
    const id = manager.registerRemotePty('claude', channel, { program: 'claude', command: 'claude' });
    tab.activePty = id;
    const exits: { id: string; exitCode?: number }[] = [];
    const subscription = messageBus.on('pty', 'exit', (event) => {
      if (event.type === 'exit') exits.push({ id: event.id, exitCode: event.exitCode });
    });

    channel.receive(`${encodeFrame({ type: 'exit', id, exitCode: 1 })}\n`);
    subscription.unsubscribe();

    expect(exits).toEqual([{ id, exitCode: 1 }]);
    expect(manager.terminalsFor('claude')).toEqual([]);
    expect(tab.activePty).toBeUndefined();
  });

  it('forwards manager input and resize to the remote session', () => {
    const { channel, sent } = attachedChannel();
    const manager = new PseudoterminalManager(makeManagers([makeTab('claude', 'red')]));
    const id = manager.registerRemotePty('claude', channel, { program: 'claude', command: 'claude' });
    sent.length = 0;

    manager.input(id, 'typed');
    manager.resizeOne(id, 90, 30);

    expect(sent).toEqual([
      { type: 'input', id, data: 'typed' },
      { type: 'resize', id, cols: 90, rows: 30 },
    ]);
  });
});
