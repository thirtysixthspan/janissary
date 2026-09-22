import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { spawnPty } from '../pty.js';
import { killShellGroup, spawnShell } from '../shell/index.js';
import { messageBus } from '../bus.js';
import { RemoteProcesses } from './serve-processes.js';

vi.mock('../pty.js');
vi.mock('../shell/index.js');
vi.mock('../harness/scratch-dir.js', () => ({ harnessSpawnEnv: vi.fn() }));

const TOKEN = 'github_pat_forwarded';
const CLAUDE_TOKEN = 'sk-ant-oat01-forwarded';
const OPENCODE_TOKEN = 'oc_live_forwarded';
const GEMINI_TOKEN = 'AIzaSyForwarded';
const CREDENTIALS = {
  github: TOKEN, claude: CLAUDE_TOKEN, opencode: OPENCODE_TOKEN, gemini: GEMINI_TOKEN,
};

function fakeShell() {
  return {
    stdin: { writable: true, write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}

describe('RemoteProcesses forwarded credentials', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(killShellGroup).mockReset();
    vi.mocked(harnessSpawnEnv).mockReset().mockReturnValue({ env: undefined });
  });

  it('passes every forwarded token to a remote PTY workspace', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: CREDENTIALS,
    });
  });

  it('passes every forwarded token to a remote persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnShell)).toHaveBeenCalledWith(0, { JANUS_AGENT_NAME: 'agent' }, {
      workspaceDir: '/remote/workspace', tokens: CREDENTIALS,
    }, { detached: true });
  });

  // The hangup that parks a peer reaches the ssh session's whole process group, so a shell left in
  // it dies with the transport the detach exists to give up.
  it('spawns a persistent shell in a process group of its own', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnShell).mock.calls[0]?.[3]).toEqual({ detached: true });
  });

  it('ends a persistent shell together with the group it leads', () => {
    const shell = fakeShell();
    vi.mocked(spawnShell).mockReturnValue(shell as never);
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    processes.kill('r1');

    expect(vi.mocked(killShellGroup)).toHaveBeenCalledWith(shell);
  });

  it('uses a joined tab\'s spawn name for its persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'creator', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
      agentName: 'joined',
    });

    expect(vi.mocked(spawnShell).mock.calls[0]?.[1]).toEqual({ JANUS_AGENT_NAME: 'joined' });
  });

  // Each token stands on its own: a project that configures only one must not have the other's
  // absence suppress it.
  it('forwards a Claude token on its own when no GitHub token is configured', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', { claude: CLAUDE_TOKEN });
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: { claude: CLAUDE_TOKEN },
    });
  });

  it('forwards an OpenCode key on its own when no other token is configured', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'opencode', { opencode: OPENCODE_TOKEN });
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: { opencode: OPENCODE_TOKEN },
    });
  });
});

// What an attaching janissary asks for. The local side knows what it once started; only this side
// knows what survived, so the table describing itself is the whole answer.
describe('RemoteProcesses session state', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockReturnValue({ env: undefined });
  });

  it('describes nothing before anything has been spawned', () => {
    expect(new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude').states()).toEqual([]);
  });

  it('answers one entry per live process, carrying its program, mode, and harness or agent name', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
      harness: 'claude',
    });
    processes.spawn({
      type: 'spawn', id: 'r2', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
      agentName: 'bekir',
    });

    expect(processes.states()).toEqual([
      { id: 'r1', program: 'claude', mode: 'pty', harness: 'claude' },
      { id: 'r2', program: 'bash', mode: 'pipe', agentName: 'bekir' },
    ]);
  });

  // The entry goes when the process does, so the answer is the live set rather than the launch
  // history — an empty one is what tells the local side to end the session instead of attaching.
  it('answers an empty list once every process has exited', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
      harness: 'claude',
    });
    const onExit = vi.mocked(spawnPty).mock.calls[0]?.[3] as { onExit: (id: string, code: number) => void };
    onExit.onExit('pty1', 0);

    expect(processes.states()).toEqual([]);
  });
});

// The gate-detection/auto-approve/busy-status pipeline this plan moves onto the far side (decision 14
// of the auto-accept-while-detached plan). `HarnessScreenReader` is real here (not mocked), so these
// drive it through fake timers exactly the way `pty-session.test.ts` already does for the client side.
const GATE_TEXT = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
const BUSY_TEXT = ' ✻ Deliberating…\n\n esc to interrupt';
const READY_TEXT = ' Some earlier output\n\n ❯\n\n ? for shortcuts';

// Xterm's cursor position carries over between writes with no clear in between, so two identical
// gate captures back to back would render at different screen positions and read as two different
// gates rather than the same one redrawn — a full clear-and-home before each redraw is what makes a
// second identical draw produce identical captured text, the way a harness's own repeated
// full-screen redraw of an unchanged gate would.
const CLEAR = '\u{1B}[2J\u{1B}[H';

describe('RemoteProcesses harness detection', () => {
  let write: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;
  let onExitHandlers: Array<(id: string, code: number) => void>;

  beforeEach(() => {
    write = vi.fn();
    vi.mocked(spawnPty).mockReset().mockReturnValue({ id: 'pty1', program: 'claude', write, resize: vi.fn(), kill: vi.fn() });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockReturnValue({ env: undefined });
    send = vi.fn();
    onExitHandlers = [];
    vi.useFakeTimers();
  });

  // Disposes every detection pipeline spawned this test (via a real exit, exactly as a live process
  // ending would) so an undisposed `HarnessScreenReader` from one test never keeps listening on the
  // shared `messageBus` and picking up the next test's bytes for the same spawn id.
  afterEach(() => {
    for (const onExit of onExitHandlers) onExit('pty1', 0);
    vi.useRealTimers();
  });

  function spawnClaude(autoApprove: boolean) {
    const processes = new RemoteProcesses(send, '/remote/workspace', 'claude');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
      harness: 'claude', autoApprove,
    });
    const handlers = vi.mocked(spawnPty).mock.calls.at(-1)?.[3] as {
      onData: (id: string, data: string) => void; onExit: (id: string, code: number) => void;
    };
    onExitHandlers.push(handlers.onExit);
    return {
      processes, handlers,
      // `\r\n`: a bare `\n` moves the cursor down without returning it to column 0, which a real PTY
      // never sends on its own — feeding it unconverted would render every line but the first padded
      // out to whatever column the previous line ended at.
      feed: async (text: string) => {
        handlers.onData('pty1', CLEAR + text.replaceAll('\n', '\r\n'));
        await vi.advanceTimersByTimeAsync(1500);
      },
    };
  }

  it('detects a permission gate and injects the approval keystroke', async () => {
    const { feed } = spawnClaude(true);
    await feed(GATE_TEXT);
    expect(write).toHaveBeenCalledWith('\r');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capture: GATE_TEXT,
    }));
  });

  // The same loop guard `HarnessAutoApprover` already has locally: an unchanged, unanswered gate is
  // reported once as standing down rather than re-sending the keystroke forever.
  it('stands down on a gate that does not clear, without re-sending the keystroke', async () => {
    const { feed } = spawnClaude(true);
    await feed(GATE_TEXT);
    write.mockClear();
    send.mockClear();
    await feed(GATE_TEXT);
    expect(write).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gate-event', id: 'r1', message: 'Auto-approve could not clear the permission prompt; standing down',
    }));
  });

  it('injects nothing when auto-approve is off, but still reports busy/ready', async () => {
    const { feed } = spawnClaude(false);
    await feed(GATE_TEXT);
    expect(write).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gate-event' }));
    expect(send).toHaveBeenCalledWith({ type: 'busy-transition', id: 'r1', busy: false, unread: true });
  });

  it('emits a live busy-transition frame while attached, sourced from the shared BusyTracker', async () => {
    const { feed } = spawnClaude(true);
    await feed(BUSY_TEXT);
    expect(send).toHaveBeenCalledWith({ type: 'busy-transition', id: 'r1', busy: true, unread: false });
    send.mockClear();
    await feed(READY_TEXT);
    await feed(READY_TEXT);
    expect(send).toHaveBeenCalledWith({ type: 'busy-transition', id: 'r1', busy: false, unread: true });
  });

  it('feeds messageBus.emit(\'pty\', …) with the client-supplied spawn id, not spawnPty\'s own internal id', async () => {
    const seen: string[] = [];
    const subscription = messageBus.on('pty', 'data', (event) => { if (event.type === 'data') seen.push(event.id); });
    try {
      const { feed } = spawnClaude(false);
      await feed(BUSY_TEXT);
      expect(seen).toEqual(['r1']);
    } finally { subscription.unsubscribe(); }
  });

  it('exposes the latest capture for capture-request, and clears it once the process exits', async () => {
    const { processes, feed, handlers } = spawnClaude(false);
    await feed(READY_TEXT);
    expect(processes.latestCapture('r1')?.text.trim()).toBe(READY_TEXT.trim());
    handlers.onExit('pty1', 0);
    expect(processes.latestCapture('r1')).toBeUndefined();
  });

  it('reports every harness process\'s current busy state via busyStates()', async () => {
    const { processes, feed } = spawnClaude(false);
    await feed(BUSY_TEXT);
    expect(processes.busyStates()).toEqual([{ id: 'r1', busy: true, unread: false }]);
  });
});
