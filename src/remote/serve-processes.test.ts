import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import { RemoteProcesses } from './serve-processes.js';

vi.mock('../pty.js');
vi.mock('../shell.js');

const TOKEN = 'github_pat_forwarded';
const CLAUDE_TOKEN = 'sk-ant-oat01-forwarded';
const CREDENTIALS = { github: TOKEN, claude: CLAUDE_TOKEN };

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
  });

  it('passes both forwarded tokens to a remote PTY workspace', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, githubToken: TOKEN, claudeToken: CLAUDE_TOKEN,
    });
  });

  it('passes both forwarded tokens to a remote persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnShell)).toHaveBeenCalledWith(0, { JANUS_AGENT_NAME: 'agent' }, {
      workspaceDir: '/remote/workspace', githubToken: TOKEN, claudeToken: CLAUDE_TOKEN,
    });
  });

  // Each token stands on its own: a project that configures only one must not have the other's
  // absence suppress it.
  it('forwards a Claude token on its own when no GitHub token is configured', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', { claude: CLAUDE_TOKEN });
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, githubToken: undefined, claudeToken: CLAUDE_TOKEN,
    });
  });
});
