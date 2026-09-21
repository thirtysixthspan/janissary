import { beforeEach, describe, expect, it, vi } from 'vitest';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { spawnPty } from '../pty.js';
import { killShellGroup, spawnShell } from '../shell/index.js';
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

// What a reattaching janissary asks for. The local side knows what it once started; only this side
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
  // history — an empty one is what tells the local side to end the session instead of reattaching.
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
