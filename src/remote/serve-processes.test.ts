import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import { RemoteProcesses } from './serve-processes.js';

vi.mock('../pty.js');
vi.mock('../shell.js');

const TOKEN = 'github_pat_forwarded';

function fakeShell() {
  return {
    stdin: { writable: true, write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}

describe('RemoteProcesses GitHub credentials', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
  });

  it('passes the forwarded token to a remote PTY workspace', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', TOKEN);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, githubToken: TOKEN,
    });
  });

  it('passes the forwarded token to a remote persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent', TOKEN);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnShell)).toHaveBeenCalledWith(0, { JANUS_AGENT_NAME: 'agent' }, {
      workspaceDir: '/remote/workspace', githubToken: TOKEN,
    });
  });
});
