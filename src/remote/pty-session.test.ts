import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRemotePtySession } from './pty-session.js';
import { RemoteChannel } from './channel/index.js';
import type { ChannelTransport } from './channel/types.js';
import { encodeFrame, encodeHandshake, decodeFrame } from './protocol.js';
import type { RemoteFrame } from './protocol-frames.js';
import { PseudoterminalManager } from './../pseudoterminal-manager.js';
import { HarnessScreenReader } from '../harness/screen.js';
import { messageBus } from '../bus.js';
import { makeTab } from '../tab/index.js';
import { clearUnreadTab, markUnreadTab } from '../tab/transcript/events.js';
import { notify } from '../notifications/index.js';
import { writeCaptureFile } from '../harness/capture/file.js';
import { HARNESS_IDLE_ESCALATION_MS, disposeHarnessIdleEscalations } from '../harness/idle-notification.js';
import type { Managers } from '../managers.js';
import type { ScheduleManager } from '../schedule/manager.js';
import type { ScheduleEntry } from '../schedule/types.js';
import type { Tab } from '../tab/types.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../harness/capture/file.js', () => ({ writeCaptureFile: vi.fn(() => '/project/.janissary/captures/claude-now.txt') }));

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
  channel.receive(`${encodeHandshake()}\n`);
  return { channel, sent };
}

function makeManagers(tabs: Tab[], schedule?: Partial<ScheduleManager>): Managers {
  return {
    schedule: { add: vi.fn(), cancel: vi.fn(), ...schedule },
    tab: {
      tabs,
      cwdOf: vi.fn(() => '/repo'),
      harnessTab: (label: string) => tabs.find((t) => t.label === label && t.harness),
      persist: vi.fn(),
      buildAgentState: vi.fn((tab: Tab) => ({ name: tab.label, dotColor: tab.dotColor, active: true })),
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      markUnread: vi.fn(),
      clearUnread: vi.fn(),
    },
  } as unknown as Managers;
}

// The idle escalation is armed off `markUnread`'s return value and cancelled by a real badge clear,
// so a fixture with both is what the arming tests need — `makeManagers`' inert stubs answer
// `undefined` and do nothing, which is the "no badge raised" and "nothing to cancel" cases.
function escalateManagers(tabs: Tab[]): Managers {
  const managers = makeManagers(tabs);
  return {
    ...managers,
    tab: {
      ...managers.tab,
      cur: () => tabs[0],
      byLabel: (l: string) => tabs.find((t) => t.label === l),
      markUnread: (l: string) => markUnreadTab(tabs, l, tabs[0].label),
      clearUnread: (l: string) => { clearUnreadTab(tabs, l); },
    },
  } as unknown as Managers;
}

describe('createRemotePtySession', () => {
  beforeEach(() => {
    vi.mocked(notify).mockClear();
    vi.mocked(writeCaptureFile).mockClear();
  });

  it('satisfies the PtySession shape, naming the remote binary rather than ssh', () => {
    const { channel } = attachedChannel();
    const session = createRemotePtySession(channel, makeManagers([]), {
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
    createRemotePtySession(channel, makeManagers([]), {
      id: 'r1', program: 'claude', command: 'claude --model opus', harness: 'claude', offline: true, cols: 100, rows: 40,
    }, vi.fn());
    expect(sent).toEqual([{
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude --model opus',
      mode: 'pty', harness: 'claude', cols: 100, rows: 40, offline: true,
    }]);
  });

  it('sends input, resize, and kill frames for the session id', () => {
    const { channel, sent } = attachedChannel();
    const session = createRemotePtySession(channel, makeManagers([]), {
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
    const session = createRemotePtySession(channel, makeManagers([]), {
      id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24,
    }, vi.fn());
    sent.length = 0;
    session.resize(0, -5);
    expect(sent).toEqual([{ type: 'resize', id: 'r1', cols: 1, rows: 1 }]);
  });

  it('publishes an inbound output frame on the bus under the session id', () => {
    const { channel } = attachedChannel();
    createRemotePtySession(channel, makeManagers([]), { id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24 }, vi.fn());
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
    createRemotePtySession(channel, makeManagers([]), { id: 'r1', program: 'claude', command: 'claude', cols: 80, rows: 24 }, onExit);
    channel.receive(`${encodeFrame({ type: 'exit', id: 'r1', exitCode: 2 })}\n`);
    expect(onExit).toHaveBeenCalledWith(2);
  });

  it('sends the autoApprove flag on the spawn frame', () => {
    const { channel, sent } = attachedChannel();
    createRemotePtySession(channel, makeManagers([]), {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, autoApprove: true,
    }, vi.fn());
    expect(sent).toEqual([{
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude',
      mode: 'pty', harness: 'claude', cols: 80, rows: 24, autoApprove: true,
    }]);
  });

  it('sends the autoResume flag on the spawn frame', () => {
    const { channel, sent } = attachedChannel();
    createRemotePtySession(channel, makeManagers([]), {
      id: 'r1', program: 'codex', command: 'codex', harness: 'codex', cols: 80, rows: 24, autoResume: true,
    }, vi.fn());
    expect(sent).toEqual([{
      type: 'spawn', id: 'r1', program: 'codex', command: 'codex',
      mode: 'pty', harness: 'codex', cols: 80, rows: 24, autoResume: true,
    }]);
  });

  describe('the scheduled resume on a remote harness tab', () => {
    const reset = { kind: 'at', time: { hour: 13, minute: 20 } } as const;

    function resumeTab(): { channel: RemoteChannel; sent: RemoteFrame[]; tab: Tab; add: ReturnType<typeof vi.fn> } {
      const { channel, sent } = attachedChannel();
      const tab = makeTab('codex', 'red');
      tab.harness = { name: 'codex', program: 'codex', ptyId: 'r1', status: 'running' };
      const add = vi.fn();
      createRemotePtySession(channel, makeManagers([tab], { add }), {
        id: 'r1', program: 'codex', command: 'codex', harness: 'codex', cols: 80, rows: 24, agentName: 'codex',
      }, vi.fn());
      return { channel, sent, tab, add };
    }

    it('turns a resume-event into a scheduled entry, a notification with the capture, and the flag', () => {
      const { channel, tab, add } = resumeTab();
      channel.receive(`${encodeFrame({
        type: 'resume-event', id: 'r1', reset, capturedAt: 1_700_000_000_000, capture: 'the screen text',
      })}
`);

      expect(add).toHaveBeenCalledTimes(1);
      const [label, entry] = add.mock.calls[0] as unknown as [string, ScheduleEntry];
      expect(label).toBe('codex');
      expect(entry.id).toBe('auto-resume');
      expect(entry.command).toBe('resume the task you were working on.');
      expect(entry.recurring).toBe(false);
      expect(entry.nextRun).toBeGreaterThan(Date.now());
      expect(vi.mocked(writeCaptureFile)).toHaveBeenCalledWith('codex', 1_700_000_000_000, 'the screen text');
      expect(vi.mocked(notify)).toHaveBeenCalledWith(
        expect.anything(), 'auto-resume', 'codex', expect.stringMatching(/^Hit a usage limit; resuming at /),
        { openFile: '/project/.janissary/captures/claude-now.txt', detectedAt: undefined },
      );
      expect(tab.harness?.autoResumeState).toBe('scheduled');
    });

    it('acknowledges delivery when the scheduler says the entry landed', () => {
      const { channel, sent, add } = resumeTab();
      channel.receive(`${encodeFrame({ type: 'resume-event', id: 'r1', reset, capturedAt: 1000 })}\n`);
      (add.mock.calls[0][2] as { fired: () => void }).fired();
      expect(sent).toContainEqual({ type: 'resume-ack', id: 'r1' });
    });

    // A stated clock time is only "already past" relative to the clock reading it, so this pins the
    // clock: at a real 00:30 the same 01:00 reset is an hour ahead and the assertion inverts.
    it('resumes at once for a report replayed long after its reset, rather than waiting a day', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-03T12:00:00'));
        const { channel, add } = resumeTab();
        channel.receive(`${encodeFrame({
          type: 'resume-event', id: 'r1', reset: { kind: 'at', time: { hour: 1, minute: 0 } }, capturedAt: 1000,
        })}\n`);
        const entry = add.mock.calls[0][1] as unknown as ScheduleEntry;
        expect(entry.nextRun).toBeLessThanOrEqual(Date.now() + 60_000);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Translation of the far side's gate-event/busy-transition reports into exactly what a local
  // detector would have produced — see `createRemotePtySession`'s `onGateEvent`/`onBusyTransition`.
  it('translates a live gate-event frame into notify() with no detection time, and writes the capture file', () => {
    const { channel } = attachedChannel();
    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());

    channel.receive(`${encodeFrame({
      type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1_700_000_000_000, capture: 'the screen text',
    })}\n`);

    expect(vi.mocked(writeCaptureFile)).toHaveBeenCalledWith('claude', 1_700_000_000_000, 'the screen text');
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      managers, 'auto-approve', 'claude', 'Auto-approved a permission prompt',
      { openFile: '/project/.janissary/captures/claude-now.txt', detectedAt: undefined },
    );
  });

  it('translates a live gate-event frame with no capture into notify() with no open file', () => {
    const { channel } = attachedChannel();
    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());

    channel.receive(`${encodeFrame({
      type: 'gate-event', id: 'r1', message: 'Auto-approve could not clear the permission prompt; standing down', capturedAt: 1000,
    })}\n`);

    expect(vi.mocked(writeCaptureFile)).not.toHaveBeenCalled();
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      managers, 'auto-approve', 'claude', 'Auto-approve could not clear the permission prompt; standing down',
      { openFile: undefined, detectedAt: undefined },
    );
  });

  describe('the tab\'s auto-approve flag', () => {
    function gateTab(): { channel: RemoteChannel; tab: Tab } {
      const { channel } = attachedChannel();
      const tab = makeTab('claude', 'red');
      tab.harness = { name: 'claude', program: 'claude', ptyId: 'r1', status: 'running' };
      createRemotePtySession(channel, makeManagers([tab]), {
        id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
      }, vi.fn());
      return { channel, tab };
    }

    it('lights once a gate-event reports an approval with its capture', () => {
      const { channel, tab } = gateTab();
      channel.receive(`${encodeFrame({
        type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1000, capture: 'the screen text',
      })}\n`);
      expect(tab.harness?.autoApproved).toBe(true);
    });

    it('stays unlit on a stand-down, which carries no capture', () => {
      const { channel, tab } = gateTab();
      channel.receive(`${encodeFrame({
        type: 'gate-event', id: 'r1', message: 'Auto-approve could not clear the permission prompt; standing down', capturedAt: 1000,
      })}\n`);
      expect(tab.harness?.autoApproved).toBeUndefined();
    });
  });

  it('translates a gate-event frame replayed on reattach into notify(), stamped with the original detection time', async () => {
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
    // As a resume does: the session id is set before the handshake, so the channel enters its
    // attaching window and the state that opens the hold, letting a frame for an id with no
    // listener yet be held instead of dropped.
    channel.sessionId = '12345678-1234-1234-1234-123456789abc';
    channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
    channel.receive(`${encodeFrame({
      type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1_700_000_000_000, capture: 'the screen text',
    })}\n`);

    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());
    await Promise.resolve();

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      managers, 'auto-approve', 'claude', 'Auto-approved a permission prompt',
      { openFile: '/project/.janissary/captures/claude-now.txt', detectedAt: new Date(1_700_000_000_000) },
    );
  });

  it('translates a busy-transition frame into addBusy/deleteBusy/markUnread and a state:dirty push', () => {
    const { channel } = attachedChannel();
    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());
    const dirty = vi.fn();
    const subscription = messageBus.on('state', 'dirty', dirty);

    try {
      channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: true, unread: false })}\n`);
      expect(managers.tab.addBusy).toHaveBeenCalledWith('claude');
      expect(dirty).toHaveBeenCalledTimes(1);

      channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: false, unread: true })}\n`);
      expect(managers.tab.deleteBusy).toHaveBeenCalledWith('claude');
      expect(managers.tab.markUnread).toHaveBeenCalledWith('claude');
      expect(dirty).toHaveBeenCalledTimes(2);
    } finally { subscription.unsubscribe(); }
  });

  it('clears the unread badge when the harness reports busy again', () => {
    const { channel } = attachedChannel();
    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());

    channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: false, unread: true })}\n`);
    expect(managers.tab.clearUnread).not.toHaveBeenCalled();
    channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: true, unread: false })}\n`);

    expect(managers.tab.clearUnread).toHaveBeenCalledWith('claude');
  });

  it('does not mark unread on a busy-transition to false with unread: false', () => {
    const { channel } = attachedChannel();
    const managers = makeManagers([makeTab('claude', 'red')]);
    createRemotePtySession(channel, managers, {
      id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
    }, vi.fn());

    channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: false, unread: false })}\n`);

    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('claude');
    expect(managers.tab.markUnread).not.toHaveBeenCalled();
  });

  // A far side runs the same busy tracker and reports the committed transition, and it lands in the
  // same `applyBusyTransition` a local capture does — so a remote harness's idle tab escalates on
  // exactly the same terms, with no extra frame and no protocol change.
  it('arms the idle escalation for a badged tab, as a local capture would', () => {
    vi.useFakeTimers();
    const managers = escalateManagers([makeTab('janus', 'blue'), makeTab('claude', 'red')]);
    try {
      const { channel } = attachedChannel();
      createRemotePtySession(channel, managers, {
        id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
      }, vi.fn());

      channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: false, unread: true })}\n`);
      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS - 1);
      expect(notify).not.toHaveBeenCalledWith(managers, 'harness-idle', 'claude', undefined, { openTab: 'claude' });

      vi.advanceTimersByTime(1);
      expect(notify).toHaveBeenCalledWith(managers, 'harness-idle', 'claude', undefined, { openTab: 'claude' });
    } finally {
      disposeHarnessIdleEscalations(managers);
      vi.useRealTimers();
    }
  });

  it('cancels the idle escalation when the far side reports the harness busy again', () => {
    vi.useFakeTimers();
    const managers = escalateManagers([makeTab('janus', 'blue'), makeTab('claude', 'red')]);
    try {
      const { channel } = attachedChannel();
      createRemotePtySession(channel, managers, {
        id: 'r1', program: 'claude', command: 'claude', harness: 'claude', cols: 80, rows: 24, agentName: 'claude',
      }, vi.fn());

      channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: false, unread: true })}\n`);
      channel.receive(`${encodeFrame({ type: 'busy-transition', id: 'r1', busy: true, unread: false })}\n`);
      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);

      expect(notify).not.toHaveBeenCalledWith(managers, 'harness-idle', 'claude', undefined, { openTab: 'claude' });
    } finally {
      disposeHarnessIdleEscalations(managers);
      vi.useRealTimers();
    }
  });
});

// The point of the whole design: everything already built on a PTY id keeps working when the
// process is on another machine.
describe('a remote PTY inside PseudoterminalManager', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delivers held replay to observers installed after the PTY is registered, before later output', async () => {
    const { channel } = attachedChannel();
    channel.sessionId = '11111111-2222-3333-4444-555555555555';
    channel.replaceTransport({ id: 'ssh2', write: vi.fn(), kill: vi.fn() });
    channel.receive(`${encodeHandshake()}\n`);
    channel.receive(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
    channel.receive(`${encodeFrame({ type: 'output', id: 'restored', data: 'previous turn\r\n' })}\n`);
    const manager = new PseudoterminalManager(makeManagers([makeTab('claude', 'red')]));
    const id = manager.registerRemotePty('claude', channel, { program: 'claude', command: 'claude' }, 'restored');
    const captures: string[] = [];
    const reader = new HarnessScreenReader(id, 80, 24, (capture) => { captures.push(capture.text.trim()); });
    try {
      channel.receive(`${encodeFrame({ type: 'output', id, data: 'current screen' })}\n`);
      channel.discardUnclaimed();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5000);
      expect(captures.join('\n')).toContain('previous turn\ncurrent screen');
    } finally { reader.dispose(); }
  });

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
