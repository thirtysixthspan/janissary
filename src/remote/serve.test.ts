import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { spawn as spawnTerminal } from 'node-pty';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir } from '../workspace/index.js';
import { loadProjectTokens } from '../project/tokens.js';
import { loadGitIdentity, getGitIdentity } from '../git/identity.js';
import { spawnPty } from '../pty.js';
import { resolveRemoteRoot } from './serve-root.js';
import { RemoteServer, wireShutdown, CHANNEL_SIGNALS } from './serve.js';
import { RemoteChannel } from './channel.js';
import { encodeFrame, decodeFrame, encodeHandshake, parseHandshake } from './protocol.js';
import type { ServerFrame } from './protocol.js';
import { DetachedPeer, relayPeer, REMOTE_DETACH_TIMEOUT_MS } from './serve-detach.js';
import { provisionRemoteWorkspace } from './serve-provision.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { readFileSync } from 'node:fs';

// Only the process spawners are faked: every other part of this file drives the real server against
// a real clone, and the credential a spawn is handed is the one thing that has no other observable.
vi.mock('../pty.js');

// The ACP agent is faked for the same reason, plus one of its own: `shutdown` must kill it *before*
// the clone is removed, and that ordering is only observable from inside the kill.
const acpMock = vi.hoisted(() => ({
  options: [] as { cwd: string; workspaceDir?: string }[],
  prompt: vi.fn(),
  kill: vi.fn(),
  killedBeforeCloneRemoved: false,
}));
vi.mock('../acp/index.js', () => ({
  connectAcp: vi.fn((options: { cwd: string; workspaceDir?: string }) => {
    acpMock.options.push(options);
    return {
      prompt: acpMock.prompt,
      kill: () => {
        acpMock.killedBeforeCloneRemoved = existsSync(options.cwd);
        acpMock.kill();
      },
    };
  }),
}));

const SPAWN_FRAME = {
  type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
} as const;

const ACP_OPEN_FRAME = {
  type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
} as const;

let tmpDir: string;
let repoDir: string;
let plainDir: string;
let originlessDir: string;
// An empty stand-in for the home directory `loadProjectTokens` falls back to, so what the remote
// resolves is the remote project's own file and never the credentials of whoever runs the suite.
let homeDir: string;

beforeAll(() => {
  tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'remote-serve-test-')));
  homeDir = path.join(tmpDir, 'home');
  mkdirSync(homeDir, { recursive: true });
  const originDir = path.join(tmpDir, 'origin.git');
  mkdirSync(originDir, { recursive: true });
  execSync('git init --bare', { cwd: originDir, stdio: 'pipe' });

  repoDir = path.join(tmpDir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(path.join(repoDir, 'README.md'), '# Remote');
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git remote add origin "${originDir}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync('git push origin HEAD', { cwd: repoDir, stdio: 'pipe' });

  plainDir = path.join(tmpDir, 'plain');
  mkdirSync(plainDir, { recursive: true });

  originlessDir = path.join(tmpDir, 'originless');
  mkdirSync(originlessDir, { recursive: true });
  execSync('git init', { cwd: originlessDir, stdio: 'pipe' });

  initWorkspaceDir(repoDir, path.join(tmpDir, '.claude.json'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveRemoteRoot', () => {
  it('roots the server exactly at a path argument', () => {
    expect(resolveRemoteRoot(repoDir)).toEqual({ root: repoDir });
  });

  it('walks up from the ssh login directory when given no argument', () => {
    const nested = path.join(repoDir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    const previous = process.cwd();
    try {
      process.chdir(nested);
      expect(resolveRemoteRoot(undefined)).toEqual({ root: repoDir });
    } finally {
      process.chdir(previous);
    }
  });

  // No upward walk for an explicit argument: `on host:/tmp` must fail loudly rather than silently
  // serving whatever repository happens to sit above /tmp.
  it('refuses a path argument that is not a git repository', () => {
    expect(resolveRemoteRoot(plainDir)).toEqual({ error: `${plainDir} is not a git repository.` });
  });

  it('refuses a path argument that does not exist', () => {
    const missing = path.join(tmpDir, 'nope');
    expect(resolveRemoteRoot(missing)).toEqual({ error: `Remote path not found: ${missing}` });
  });

  it('refuses a repository with no origin remote', () => {
    expect(resolveRemoteRoot(originlessDir)).toEqual({ error: `${originlessDir} has no "origin" remote.` });
  });
});

function makeServer() {
  const frames: ServerFrame[] = [];
  const exit = vi.fn();
  const server = new RemoteServer(repoDir, (frame) => { frames.push(frame); }, exit);
  return { server, frames, exit };
}

describe('RemoteServer', () => {
  it.each(['SIGTERM', 'SIGINT'])('preserves work on SIGHUP, then cleans up on %s', async (signal) => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: `sleep-${signal}` })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    const ready = frames.find((frame) => frame.type === 'workspace-ready')!;
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);
    const kill = vi.mocked(spawnPty).mock.results.at(-1)!.value.kill;
    const handlers = new Map<string, () => void>();
    wireShutdown(server, (name, handler) => handlers.set(name, handler));
    handlers.get('SIGHUP')!();
    expect(kill).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
    expect(existsSync(ready.dir)).toBe(true);
    handlers.get(signal)!();
    expect(kill).toHaveBeenCalled(); expect(exit).toHaveBeenCalledWith(0);
    expect(existsSync(ready.dir)).toBe(false);
  });

  it('shuts down and removes the workspace on an explicit shutdown frame', async () => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'sleep-shutdown' })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    const ready = frames.find((frame) => frame.type === 'workspace-ready')!;
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);
    const kill = vi.mocked(spawnPty).mock.results.at(-1)!.value.kill;
    server.receive(`${encodeFrame({ type: 'shutdown' })}\n`);
    expect(kill).toHaveBeenCalled(); expect(exit).toHaveBeenCalledWith(0);
    expect(existsSync(ready.dir)).toBe(false);
  });
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
    acpMock.options.length = 0;
    acpMock.prompt.mockReset();
    acpMock.kill.mockReset();
    acpMock.killedBeforeCloneRemoved = false;
  });

  it('clones the root\'s origin on a provision request and answers workspace-ready', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-ready' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    const ready = frames.find((f) => f.type === 'workspace-ready');
    expect(ready?.dir).toBe(path.join(repoDir, '.janissary', 'workspace', 'claude-ready'));
    expect(existsSync(path.join(ready!.dir, 'README.md'))).toBe(true);
    server.shutdown(0);
  });

  // The credential the remote workspace ends up with is invisible until a much later `git push`
  // fails, so the provisioning answer says when it is not the forwarded one. Both assertions look
  // for the clause rather than the whole notice, since the isolation half depends on the machine
  // running the test.
  it('says nothing about the token when the forwarded one is in use', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-forwarded', tokens: { github: 'github_pat_forwarded' } })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('github token:');
    server.shutdown(0);
  });

  it('reports a workspace left with no token at all', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-tokenless' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    expect(frames.find((f) => f.type === 'workspace-ready')?.notice).toContain('github token:');
    server.shutdown(0);
  });

  // The Claude token deliberately gets no notice of its own: a missing one shows up in the harness's
  // own output immediately, and most remote launches have none configured and are working as meant.
  it('hands a remote workspace the forwarded Claude token and says nothing about it', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-oauth', tokens: { claude: 'sk-ant-oat01-forwarded' } })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { claude: 'sk-ant-oat01-forwarded' } });
    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('claude token');
    server.shutdown(0);
  });

  it('hands a remote workspace the forwarded OpenCode key and says nothing about it', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'opencode-key', tokens: { opencode: 'oc_live_forwarded' } })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { opencode: 'oc_live_forwarded' } });
    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('opencode');
    server.shutdown(0);
  });

  it('hands a remote workspace the forwarded Gemini key and says nothing about it', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'gemini-key', tokens: { gemini: 'AIzaSyForwarded' } })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { gemini: 'AIzaSyForwarded' } });
    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('gemini');
    server.shutdown(0);
  });

  it('falls back to the remote\'s own Gemini key when none is forwarded', async () => {
    const tokenPath = path.join(repoDir, '.janissary', 'gemini-token');
    writeFileSync(tokenPath, 'AIzaSyRemoteOwn\n');
    loadProjectTokens(repoDir, homeDir);
    try {
      const { server, frames } = makeServer();
      server.receive(`${encodeFrame({ type: 'provision', label: 'gemini-own-key' })}\n`);
      await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
      server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

      expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { gemini: 'AIzaSyRemoteOwn' } });
      server.shutdown(0);
    } finally {
      rmSync(tokenPath, { force: true });
      loadProjectTokens(repoDir, homeDir);
    }
  });

  it('falls back to the remote\'s own OpenCode key when none is forwarded', async () => {
    const tokenPath = path.join(repoDir, '.janissary', 'opencode-token');
    writeFileSync(tokenPath, 'oc_live_remote_own\n');
    loadProjectTokens(repoDir, homeDir);
    try {
      const { server, frames } = makeServer();
      server.receive(`${encodeFrame({ type: 'provision', label: 'opencode-own-key' })}\n`);
      await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
      server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

      expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { opencode: 'oc_live_remote_own' } });
      server.shutdown(0);
    } finally {
      rmSync(tokenPath, { force: true });
      loadProjectTokens(repoDir, homeDir);
    }
  });

  it('falls back to the remote\'s own Claude token when none is forwarded', async () => {
    const tokenPath = path.join(repoDir, '.janissary', 'claude-token');
    writeFileSync(tokenPath, 'sk-ant-oat01-remote-own\n');
    loadProjectTokens(repoDir, homeDir);
    try {
      const { server, frames } = makeServer();
      server.receive(`${encodeFrame({ type: 'provision', label: 'claude-own-token' })}\n`);
      await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
      server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

      expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ tokens: { claude: 'sk-ant-oat01-remote-own' } });
      server.shutdown(0);
    } finally {
      rmSync(tokenPath, { force: true });
      loadProjectTokens(repoDir, homeDir);
    }
  });

  // The identity is a process-wide fact rather than a per-spawn option, so what a provision did with
  // it is read back from the module every sandboxed spawn on this machine will consult.
  it('installs the forwarded git identity over the remote machine\'s own', async () => {
    loadGitIdentity(repoDir);
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({
      type: 'provision', label: 'identity-forwarded',
      identity: { name: 'Ada Lovelace', email: 'ada@example.com' },
    })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    expect(getGitIdentity()).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
    server.shutdown(0);
  });

  it('keeps the remote machine\'s own git identity when none is forwarded', async () => {
    loadGitIdentity(repoDir);
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'identity-own' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    expect(getGitIdentity()).toEqual({ name: 'test', email: 'test@test.com' });
    server.shutdown(0);
  });

  it('removes the clone when the session ends, after disposing the ACP agent that lives in it', async () => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-cleanup' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    const dir = frames.find((f) => f.type === 'workspace-ready')!.dir;
    server.receive(`${encodeFrame(ACP_OPEN_FRAME)}\n`);

    server.shutdown(0);

    // Ordered: the clone must never be removed out from under a live agent.
    expect(acpMock.killedBeforeCloneRemoved).toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('refuses an ACP frame that arrives before a workspace exists', () => {
    const { server, frames } = makeServer();

    server.receive(`${encodeFrame(ACP_OPEN_FRAME)}\n`);
    server.receive(`${encodeFrame({ type: 'acp-prompt', id: 'racp1', text: 'hi' })}\n`);

    expect(frames).toEqual([
      { type: 'workspace-failed', message: 'No remote workspace has been provisioned.' },
      { type: 'workspace-failed', message: 'No remote workspace has been provisioned.' },
    ]);
  });

  it('drives the ACP holder once a workspace has been provisioned', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'acp-driven' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    const dir = frames.find((f) => f.type === 'workspace-ready')!.dir;

    server.receive(`${encodeFrame(ACP_OPEN_FRAME)}\n`);
    server.receive(`${encodeFrame({ type: 'acp-prompt', id: 'racp1', text: 'summarize this' })}\n`);
    server.receive(`${encodeFrame({ type: 'acp-close', id: 'racp1' })}\n`);

    expect(acpMock.options[0]).toMatchObject({ command: 'opencode', args: ['acp'], cwd: dir, workspaceDir: dir });
    expect(acpMock.prompt.mock.calls[0][0]).toBe('summarize this');
    expect(acpMock.kill).toHaveBeenCalledTimes(1);
    server.shutdown(0);
  });

  it('shuts down only once however many signals arrive', () => {
    const { server, exit } = makeServer();
    server.shutdown(0);
    server.shutdown(0);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('detaches on SIGHUP and shuts down on SIGTERM', () => {
    const { server, exit } = makeServer();
    const handlers = new Map<string, () => void>();
    wireShutdown(server, (signal, handler) => { handlers.set(signal, handler); });

    expect([...handlers.keys()]).toEqual([...CHANNEL_SIGNALS]);
    handlers.get('SIGHUP')!();
    expect(exit).not.toHaveBeenCalled();
    handlers.get('SIGTERM')!();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('refuses a frame outside the union', () => {
    const { server, frames } = makeServer();
    server.receive(`${JSON.stringify({ type: 'exec', id: 'r1' })}\n`);
    expect(frames).toEqual([
      { type: 'workspace-failed', message: expect.stringContaining('Unknown remote frame type "exec"') },
    ]);
  });

  it('refuses a frame only it may send', () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'x' })}\n`);
    expect(frames).toEqual([
      { type: 'workspace-failed', message: expect.stringContaining('Unexpected remote frame "output"') },
    ]);
  });

  it('refuses to spawn anything before a workspace has been provisioned', () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24 })}\n`);
    expect(frames).toEqual([
      { type: 'workspace-failed', message: 'No remote workspace has been provisioned.' },
    ]);
  });

  it('buffers a frame split across two reads', () => {
    const { server, frames } = makeServer();
    const line = JSON.stringify({ type: 'exec' });
    server.receive(line.slice(0, 5));
    expect(frames).toEqual([]);
    server.receive(`${line.slice(5)}\n`);
    expect(frames).toHaveLength(1);
  });

  // The question an attaching janissary asks, and the only way it learns what to open a tab for.
  it('answers session-state with one entry per live process', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-state' })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame({ ...SPAWN_FRAME, harness: 'claude' })}\n`);
    server.receive(`${encodeFrame({ type: 'session-state' })}\n`);

    const answer = frames.find((frame) => frame.type === 'session-state-result');
    expect(answer?.processes).toEqual([
      { id: 'r1', program: 'claude', mode: 'pty', harness: 'claude' },
    ]);
    server.shutdown(0);
  });

  it('answers an empty list once every process has exited', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-empty' })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);
    const handlers = vi.mocked(spawnPty).mock.calls.at(-1)![3];
    handlers.onExit('pty1', 0);
    server.receive(`${encodeFrame({ type: 'session-state' })}\n`);

    const answer = frames.find((frame) => frame.type === 'session-state-result');
    expect(answer?.processes).toEqual([]);
    server.shutdown(0);
  });

  // A PTY that will not start is that one process failing, not the session: the tab that asked hears
  // an exit, and the server stays up to answer whatever comes next.
  it('answers a spawn whose PTY will not start with that process\'s exit, and keeps serving', async () => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-spawn-fails' })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    vi.mocked(spawnPty).mockImplementationOnce(() => { throw new Error('pty refused'); });

    expect(() => server.receive(`${encodeFrame({ ...SPAWN_FRAME, harness: 'claude' })}\n`)).not.toThrow();
    server.receive(`${encodeFrame({ type: 'session-state' })}\n`);

    expect(frames).toContainEqual({ type: 'exit', id: 'r1', exitCode: 1 });
    expect(frames.find((frame) => frame.type === 'session-state-result')?.processes).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
    server.shutdown(0);
  });

  // A peer that has not provisioned is holding nothing, which is a fact worth stating: answering
  // with the provisioning refusal instead would read to the local side as an unreachable host.
  it('answers an empty list before a workspace exists rather than refusing', () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'session-state' })}\n`);
    expect(frames).toEqual([{ type: 'session-state-result', processes: [] }]);
  });
});

describe('RemoteServer provision — label check', () => {
  const workspaceBase = () => path.join(repoDir, '.janissary', 'workspace');
  const peerRecords = () => path.join(repoDir, '.janissary', 'remote');

  it('answers name-in-use for a label a live peer on this host carries, provisioning nothing', async () => {
    mkdirSync(peerRecords(), { recursive: true });
    const record = path.join(peerRecords(), `${randomUUID()}.json`);
    writeFileSync(record, JSON.stringify({ pid: process.pid, socket: '/tmp/none.sock', label: 'held-label' }));
    const { server, frames } = makeServer();
    try {
      server.receive(`${encodeFrame({ type: 'provision', label: 'held-label' })}\n`);
      await vi.waitFor(() => expect(frames).toEqual([{ type: 'name-in-use', label: 'held-label' }]));
      expect(existsSync(path.join(workspaceBase(), 'held-label'))).toBe(false);
    } finally {
      rmSync(record, { force: true });
    }
  });

  it('answers name-in-use for a label a live peer carries in another case, removing nothing', async () => {
    const owned = path.join(workspaceBase(), 'case-label');
    mkdirSync(owned, { recursive: true });
    writeFileSync(path.join(owned, 'live.txt'), 'live work');
    mkdirSync(peerRecords(), { recursive: true });
    const record = path.join(peerRecords(), `${randomUUID()}.json`);
    writeFileSync(record, JSON.stringify({ pid: process.pid, socket: '/tmp/none.sock', label: 'case-label' }));
    const { server, frames } = makeServer();
    try {
      server.receive(`${encodeFrame({ type: 'provision', label: 'CASE-LABEL' })}\n`);
      await vi.waitFor(() => expect(frames).toEqual([{ type: 'name-in-use', label: 'CASE-LABEL' }]));
      expect(existsSync(path.join(owned, 'live.txt'))).toBe(true);
    } finally {
      rmSync(record, { force: true });
      rmSync(owned, { recursive: true, force: true });
    }
  });

  it('removes a leftover with nothing running in it, clones, and reports the removal', async () => {
    const leftover = path.join(workspaceBase(), 'leftover-label');
    mkdirSync(leftover, { recursive: true });
    writeFileSync(path.join(leftover, 'uncommitted.txt'), 'stale work');
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'leftover-label' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));

    expect(frames.find((f) => f.type === 'workspace-ready')).toMatchObject({ dir: leftover, cleaned: leftover });
    expect(existsSync(path.join(leftover, 'uncommitted.txt'))).toBe(false);
    expect(existsSync(path.join(leftover, 'README.md'))).toBe(true);
    server.shutdown(0);
  });

  it('keeps a leftover and answers workspace-failed when the root has lost its origin remote', async () => {
    const leftover = path.join(workspaceBase(), 'originless-label');
    mkdirSync(leftover, { recursive: true });
    writeFileSync(path.join(leftover, 'uncommitted.txt'), 'stale work');
    execSync('git remote remove origin', { cwd: repoDir, stdio: 'pipe' });
    const { server, frames } = makeServer();
    try {
      server.receive(`${encodeFrame({ type: 'provision', label: 'originless-label' })}\n`);
      await vi.waitFor(() => expect(frames).toHaveLength(1));
      expect(frames[0]).toMatchObject({ type: 'workspace-failed', message: expect.stringMatching(/^Failed to create workspace:/) });
      expect(existsSync(path.join(leftover, 'uncommitted.txt'))).toBe(true);
    } finally {
      execSync(`git remote add origin "${path.join(tmpDir, 'origin.git')}"`, { cwd: repoDir, stdio: 'pipe' });
      rmSync(leftover, { recursive: true, force: true });
    }
  });

  it('answers name-in-use with the path and reason when a leftover cannot be removed', async () => {
    const leftover = path.join(workspaceBase(), 'stuck-label');
    mkdirSync(path.join(leftover, 'nested'), { recursive: true });
    chmodSync(workspaceBase(), 0o500);
    const { server, frames } = makeServer();
    try {
      server.receive(`${encodeFrame({ type: 'provision', label: 'stuck-label' })}\n`);
      await vi.waitFor(() => expect(frames).toHaveLength(1));
      expect(frames[0]).toMatchObject({ type: 'name-in-use', label: 'stuck-label', path: leftover, reason: expect.stringMatching(/EACCES|EPERM/) });
    } finally {
      chmodSync(workspaceBase(), 0o755);
      rmSync(leftover, { recursive: true, force: true });
    }
  });

  it('refuses a label that climbs out of the workspace base, leaving the folder there intact', async () => {
    const sentinel = path.join(repoDir, '.janissary', 'sentinel');
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(path.join(sentinel, 'keep.txt'), 'keep');
    const { server, frames } = makeServer();
    try {
      server.receive(`${encodeFrame({ type: 'provision', label: '../sentinel' })}\n`);
      await vi.waitFor(() => expect(frames).toHaveLength(1));
      expect(frames[0]).toMatchObject({
        type: 'workspace-failed',
        message: expect.stringMatching(/^Cannot launch "\.\.\/sentinel": a workspace name must be a single folder name/),
      });
      expect(existsSync(path.join(sentinel, 'keep.txt'))).toBe(true);
    } finally {
      rmSync(sentinel, { recursive: true, force: true });
    }
  });

  it('writes the label into the peer record before it clones', async () => {
    const order: string[] = [];
    await provisionRemoteWorkspace({
      emit: () => {},
      workspaces: { create: vi.fn(() => { order.push('clone'); return { error: 'stop here' }; }) } as unknown as WorkspaceManager,
      peer: { setLabel: vi.fn(() => { order.push('label'); }) } as unknown as DetachedPeer,
      idle: () => true,
      stopping: () => false,
      provisioned: vi.fn(),
    }, 'ordered-label', {}, {});
    expect(order).toEqual(['label', 'clone']);
  });
});
describe('detached peer rendezvous', () => {
  it.each(['pipe', 'pty'] as const)('keeps a real %s shell and workspace through terminal hangup and a fresh remote-serve process', async (mode) => {
    const script = `
      import { RemoteServer } from ${JSON.stringify(new URL('serve.ts', import.meta.url).href)};
      import { initWorkspaceDir } from ${JSON.stringify(new URL('../workspace/index.ts', import.meta.url).href)};
      import { getConfig } from ${JSON.stringify(new URL('../config.ts', import.meta.url).href)};
      getConfig().sandboxWorkspaces = false;
      initWorkspaceDir(process.argv[1], process.argv[1] + '/absent-config');
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      new RemoteServer(process.argv[1]).listen();
    `;
    const start = () => {
      const child = spawnTerminal(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, repoDir], {
        env: { ...process.env, SHELL: '/bin/bash' },
      });
      let buffer = '';
      const lines: string[] = [];
      child.onData((chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          lines.push(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
      });
      return { child, lines, send: (frame: Parameters<typeof encodeFrame>[0]) => child.write(`${encodeFrame(frame)}\n`) };
    };
    const peer = start();
    let proxy: ReturnType<typeof start> | undefined;
    const stop = async (child: ReturnType<typeof spawnTerminal>) => {
      try { process.kill(child.pid, 'SIGTERM'); } catch { return; }
      await vi.waitFor(() => expect(() => process.kill(child.pid, 0)).toThrow());
    };
    try {
      await vi.waitFor(() => expect(peer.lines[0]).toContain('__JANUS_REMOTE__'), { timeout: 10_000 });
      const handshake = parseHandshake(peer.lines[0]);
      if ('error' in handshake || !handshake.session) throw new Error('missing peer identity');
      peer.send({ type: 'provision', label: 'real-sleep-shell' });
      await vi.waitFor(() => expect(peer.lines.some((line) => line.includes('workspace-ready'))).toBe(true), { timeout: 10_000 });
      peer.send({ ...SPAWN_FRAME, id: 'shell', program: 'sh', command: '/bin/sh', mode });
      peer.send({ type: 'input', id: 'shell', data: 'printf "before:%s\\n" "$$"\n' });
      const outputs = (lines: string[]) => lines.map((line) => decodeFrame(line))
        .filter((frame) => 'type' in frame && frame.type === 'output').map((frame) => frame.data).join('');
      await vi.waitFor(() => expect(outputs(peer.lines)).toMatch(/before:\d+/));
      const shellPid = /before:(\d+)/.exec(outputs(peer.lines))![1];
      peer.child.kill();
      proxy = start();
      const restored = proxy;
      await vi.waitFor(() => expect(restored.lines[0]).toContain('__JANUS_REMOTE__'), { timeout: 10_000 });
      restored.send({ type: 'attach', session: handshake.session, restore: true });
      await vi.waitFor(() => expect(restored.lines.join('\n')).toContain('"accepted":true'));
      if (mode === 'pty') await vi.waitFor(() => expect(outputs(restored.lines)).toContain(`before:${shellPid}`));
      restored.send({ type: 'input', id: 'shell', data: 'printf "after:%s\\n" "$$"\n' });
      await vi.waitFor(() => expect(outputs(restored.lines)).toContain(`after:${shellPid}`));
      expect(() => process.kill(peer.child.pid, 0)).not.toThrow();
      expect(existsSync(path.join(repoDir, '.janissary', 'workspace', 'real-sleep-shell'))).toBe(true);
      const channel = new RemoteChannel({
        id: 'closing-ssh', write: (data) => restored.child.write(data), kill: () => restored.child.kill(),
      }, { onTerminalData: vi.fn(), onAttached: vi.fn(), onFrame: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
      restored.child.onExit(() => channel.closed());
      channel.receive(`${encodeHandshake(repoDir)}\n`);
      channel.finish();
      channel.close();
      await vi.waitFor(() => expect(existsSync(path.join(repoDir, '.janissary', 'workspace', 'real-sleep-shell'))).toBe(false));
    } finally {
      if (proxy) await stop(proxy.child);
      await stop(peer.child);
    }
    expect(existsSync(path.join(repoDir, '.janissary', 'workspace', 'real-sleep-shell'))).toBe(false);
  }, 30_000);
  it('attaches over a private socket, redraws terminals, and replays only missed transcript blocks', async () => {
    const received = vi.fn(), output: string[] = [];
    const peer = new DetachedPeer(repoDir, randomUUID(), received, vi.fn());
    await peer.start(vi.fn());
    peer.emit({ type: 'transcript', blocks: ['already delivered'] });
    peer.detach();
    peer.emit({ type: 'output', id: 'r1', data: 'missed terminal bytes' });
    peer.emit({ type: 'transcript', blocks: ['first missed block'] });
    peer.emit({ type: 'transcript', blocks: ['second missed block'] });
    peer.emit({ type: 'acp-chunk', id: 'a1', text: 'reply' });
    peer.emit({ type: 'acp-end', id: 'a1', stopReason: 'end_turn' });
    peer.track({ ...SPAWN_FRAME, id: 'shell', mode: 'pipe' });
    peer.emit({ type: 'output', id: 'shell', data: 'command completion sentinel' });
    const ended = vi.fn();
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, ended)!;
    try {
      await vi.waitFor(() => expect(output.join('')).toContain('acp-end'));
      const frames = output.join('').trim().split('\n').map((line) => JSON.parse(line));
      expect(frames.map((frame) => frame.type)).toEqual(['attach-result', 'output', 'output', 'transcript', 'transcript', 'acp-chunk', 'acp-end', 'output']);
      expect(frames.at(-1).id).toBe('shell');
      socket.write(`${encodeFrame({ type: 'input', id: 'r1', data: 'new input' })}\n`);
      await vi.waitFor(() => expect(received).toHaveBeenCalledWith(expect.stringContaining('input')));
      socket.destroy(); await vi.waitFor(() => expect(ended).toHaveBeenCalled());
      output.length = 0;
      const again = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(output.join('')).toContain('attach-result'));
        expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
          { type: 'attach-result', accepted: true },
          { type: 'output', id: 'r1', data: '\u{1B}cmissed terminal bytes' },
          { type: 'output', id: 'shell', data: '\u{1B}ccommand completion sentinel' },
        ]);
      } finally { again.destroy(); }
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('restores earlier and detached display and transcript history through the relay exactly once', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    peer.emit({ type: 'output', id: 'terminal', data: 'before detach\r\n' });
    peer.emit({ type: 'transcript', blocks: ['earlier turn'] });
    peer.detach();
    peer.emit({ type: 'output', id: 'terminal', data: 'while detached' });
    peer.emit({ type: 'transcript', blocks: ['later turn'] });
    const output: string[] = [];
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn(), true)!;
    try {
      await vi.waitFor(() => expect(output.join('')).toContain('transcript'));
      expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
        { type: 'attach-result', accepted: true },
        { type: 'output', id: 'terminal', data: '\u{1B}cbefore detach\r\nwhile detached' },
        { type: 'transcript', blocks: ['earlier turn', 'later turn'] },
      ]);
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('restores retained agent pipe output through the relay', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    peer.track({ type: 'spawn', id: 'agent', program: 'shell', command: 'shell', mode: 'pipe', agentName: 'agent' });
    peer.emit({ type: 'output', id: 'agent', data: 'before detach' });
    peer.detach();
    peer.emit({ type: 'output', id: 'agent', data: ' while detached' });
    const output: string[] = [];
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn(), true)!;
    try {
      await vi.waitFor(() => expect(output.join('').trim().split('\n')).toHaveLength(2));
      expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
        { type: 'attach-result', accepted: true },
        { type: 'output', id: 'agent', data: '\u{1B}cbefore detach while detached' },
      ]);
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('replays a piped shell\'s commands beside its output through the relay', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    peer.track({ type: 'spawn', id: 'agent', program: 'shell', command: 'shell', mode: 'pipe', agentName: 'agent' });
    peer.input({ type: 'input', id: 'agent', data: '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n' });
    peer.emit({ type: 'output', id: 'agent', data: 'web\n__JS_END_3_1__\n' });
    peer.detach();
    peer.input({ type: 'input', id: 'agent', data: '{ :; ps\n} 2>&1; echo "__JS_END_3_2__"\n' });
    peer.emit({ type: 'output', id: 'agent', data: 'not permitted\n__JS_END_3_2__\n' });
    const output: string[] = [];
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn(), true)!;
    try {
      await vi.waitFor(() => expect(output.join('')).toContain('shell-history'));
      expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
        { type: 'attach-result', accepted: true },
        { type: 'shell-history', id: 'agent', runs: [
          { source: 'input', text: '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n' },
          { source: 'output', text: 'web\n__JS_END_3_1__\n' },
          { source: 'input', text: '{ :; ps\n} 2>&1; echo "__JS_END_3_2__"\n' },
          { source: 'output', text: 'not permitted\n__JS_END_3_2__\n' },
        ] },
      ]);
    } finally { socket.destroy(); peer.dispose(); }
  });

  // A pty echoes what is written to it, so its retained output already carries the commands; keeping
  // the input as well would replay every keystroke twice.
  it('does not retain input written to a pty process', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    peer.track({ type: 'spawn', id: 'terminal', program: 'claude', command: 'claude', mode: 'pty', harness: 'claude' });
    peer.input({ type: 'input', id: 'terminal', data: 'hello' });
    peer.emit({ type: 'output', id: 'terminal', data: 'hello\r\n' });
    peer.detach();
    const output: string[] = [];
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn(), true)!;
    try {
      await vi.waitFor(() => expect(output.join('').trim().split('\n')).toHaveLength(2));
      expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
        { type: 'attach-result', accepted: true },
        { type: 'output', id: 'terminal', data: '\u{1B}chello\r\n' },
      ]);
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('drops the oldest buffered frames once the replay budget is exceeded, and reports the gap', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    peer.detach();
    const big = 'x'.repeat(50_000);
    for (let index = 0; index < 30; index++) peer.emit({ type: 'transcript', blocks: [`${big}-${index}`] });
    const output: string[] = [];
    const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
    try {
      await vi.waitFor(() => expect(output.join('')).toContain('attach-result'));
      const frames = output.join('').trim().split('\n').map((line) => decodeFrame(line));
      expect(frames[0]).toMatchObject({ type: 'attach-result', accepted: true, truncated: true });
      const transcripts = frames.filter((frame) => 'type' in frame && frame.type === 'transcript') as Extract<ServerFrame, { type: 'transcript' }>[];
      expect(transcripts.length).toBeLessThan(30);
      expect(transcripts.at(-1)!.blocks[0]).toContain('-29');
      expect(transcripts.some((frame) => frame.blocks[0].includes('-0'))).toBe(false);
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('refuses the wrong session and distinguishes a dead pid from a live unreachable peer', async () => {
    const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
    await peer.start(vi.fn());
    const recordPath = path.join(repoDir, '.janissary', 'remote', `${peer.session}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    const socket = createConnection(record.socket);
    const output: string[] = [];
    socket.setEncoding('utf8'); socket.on('data', (data: string) => { output.push(data); });
    try {
      socket.write(`${encodeFrame({ type: 'attach', session: randomUUID() })}\n`);
      await vi.waitFor(() => expect(output.join('')).toContain('"accepted":false'));
      const ended = vi.fn();
      const unknown = relayPeer(repoDir, randomUUID(), vi.fn(), ended);
      expect(unknown).toBeUndefined(); expect(ended).toHaveBeenLastCalledWith(true);
      writeFileSync(recordPath, JSON.stringify({ pid: 2_147_483_647, socket: record.socket }));
      expect(relayPeer(repoDir, peer.session, vi.fn(), ended)).toBeUndefined();
      expect(ended).toHaveBeenLastCalledWith(true);
      ended.mockClear();
      writeFileSync(recordPath, JSON.stringify({ pid: process.pid, socket: path.join(tmpDir, 'absent.sock') }));
      const unreachable = relayPeer(repoDir, peer.session, vi.fn(), ended)!;
      await vi.waitFor(() => expect(ended).toHaveBeenCalledExactlyOnceWith(false));
      unreachable.destroy();
    } finally { socket.destroy(); peer.dispose(); }
  });

  it('expires an unattached peer and cleans up its workspace', async () => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'sleep-expiry' })}\n`);
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'workspace-ready')).toBe(true));
    const ready = frames.find((frame) => frame.type === 'workspace-ready')!;
    const peer = new DetachedPeer(repoDir, randomUUID(), (data) => server.receive(data), () => server.shutdown(0));
    await peer.start(vi.fn());
    vi.useFakeTimers();
    try {
      peer.detach(); vi.advanceTimersByTime(REMOTE_DETACH_TIMEOUT_MS - 1);
      expect(exit).not.toHaveBeenCalled(); expect(existsSync(ready.dir)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(exit).toHaveBeenCalledOnce(); expect(existsSync(ready.dir)).toBe(false);
    } finally { peer.dispose(); vi.useRealTimers(); server.shutdown(0); }
  });

  // The auto-accept-while-detached plan's decisions 16, 18, and 20: a capture-request answers a
  // parked peer directly without attaching it, a gate-event frame queues and replays like any other
  // pending frame, and a busy-transition frame is sent live but never queued while detached.
  describe('capture-request and detection frames', () => {
    it('answers a capture-request directly, without attaching, claiming the socket, or ending the peer\'s ability to be attached afterward', async () => {
      const getCapture = vi.fn((id: string) => (id === 'r1' ? { text: 'screen text', capturedAt: 555 } : undefined));
      const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn(), getCapture);
      await peer.start(vi.fn());
      peer.detach();
      const record = JSON.parse(readFileSync(path.join(repoDir, '.janissary', 'remote', `${peer.session}.json`), 'utf8'));
      const querySocket = createConnection(record.socket);
      const queryOutput: string[] = [];
      querySocket.setEncoding('utf8');
      querySocket.on('data', (data: string) => { queryOutput.push(data); });
      try {
        querySocket.write(`${encodeFrame({ type: 'capture-request', session: peer.session, id: 'r1', request: 'q1' })}\n`);
        await vi.waitFor(() => expect(queryOutput.join('')).toContain('capture-reply'));
        expect(decodeFrame(queryOutput.join('').trim())).toEqual({ type: 'capture-reply', id: 'r1', request: 'q1', text: 'screen text', capturedAt: 555 });
        expect(getCapture).toHaveBeenCalledWith('r1');
        // Closed on its own once answered — not left open the way a real attach's socket would be.
        await vi.waitFor(() => expect(querySocket.destroyed || querySocket.readableEnded).toBe(true));
        // The peer itself was never claimed: a real attach still succeeds afterward.
        const output: string[] = [];
        const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
        try {
          await vi.waitFor(() => expect(output.join('')).toContain('"accepted":true'));
        } finally { socket.destroy(); }
      } finally { querySocket.destroy(); peer.dispose(); }
    });

    it('answers a capture-request with no fields when nothing has been captured for that id', async () => {
      const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn(), () => { /* nothing captured */ });
      await peer.start(vi.fn());
      peer.detach();
      const record = JSON.parse(readFileSync(path.join(repoDir, '.janissary', 'remote', `${peer.session}.json`), 'utf8'));
      const socket = createConnection(record.socket);
      const output: string[] = [];
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => { output.push(data); });
      try {
        socket.write(`${encodeFrame({ type: 'capture-request', session: peer.session, id: 'unknown', request: 'q1' })}\n`);
        await vi.waitFor(() => expect(output.join('')).toContain('capture-reply'));
        expect(decodeFrame(output.join('').trim())).toEqual({ type: 'capture-reply', id: 'unknown', request: 'q1' });
      } finally { socket.destroy(); peer.dispose(); }
    });

    it('refuses a capture-request naming the wrong session, the same as attach does', async () => {
      const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn(), () => ({ text: 'x', capturedAt: 1 }));
      await peer.start(vi.fn());
      peer.detach();
      const record = JSON.parse(readFileSync(path.join(repoDir, '.janissary', 'remote', `${peer.session}.json`), 'utf8'));
      const socket = createConnection(record.socket);
      const output: string[] = [];
      socket.setEncoding('utf8');
      socket.on('data', (data: string) => { output.push(data); });
      try {
        socket.write(`${encodeFrame({ type: 'capture-request', session: randomUUID(), id: 'r1', request: 'q1' })}\n`);
        await vi.waitFor(() => expect(output.join('')).toContain('"accepted":false'));
      } finally { socket.destroy(); peer.dispose(); }
    });

    it('queues a gate-event frame emitted while detached and replays it on attach, like output/exit', async () => {
      const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
      await peer.start(vi.fn());
      peer.detach();
      peer.emit({ type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1000, capture: 'gate text' });
      const output: string[] = [];
      const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(output.join('')).toContain('gate-event'));
        expect(output.join('').trim().split('\n').map((line) => decodeFrame(line))).toEqual([
          { type: 'attach-result', accepted: true },
          { type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1000, capture: 'gate text' },
        ]);
      } finally { socket.destroy(); peer.dispose(); }
    });

    it('drops a busy-transition frame emitted while detached rather than queuing it', async () => {
      const peer = new DetachedPeer(repoDir, randomUUID(), vi.fn(), vi.fn());
      await peer.start(vi.fn());
      peer.detach();
      peer.emit({ type: 'busy-transition', id: 'r1', busy: true, unread: false });
      const output: string[] = [];
      const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(output.join('')).toContain('attach-result'));
        expect(output.join('')).not.toContain('busy-transition');
      } finally { socket.destroy(); peer.dispose(); }
    });

    it('sends exactly one busy-transition frame on attach, reflecting the current value rather than a replay of every flip', async () => {
      let currentBusy = true;
      const peer = new DetachedPeer(
        repoDir, randomUUID(), vi.fn(), vi.fn(), () => { /* no capture pipeline needed for this test */ },
        () => [{ id: 'r1', busy: currentBusy, unread: false }],
      );
      await peer.start(vi.fn());
      peer.detach();
      // Flips while detached — decision 20 says none of them are individually reported.
      currentBusy = false;
      currentBusy = true;
      currentBusy = false;
      const output: string[] = [];
      const socket = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(output.join('')).toContain('busy-transition'));
        const frames = output.join('').trim().split('\n').map((line) => decodeFrame(line));
        expect(frames.filter((frame) => 'type' in frame && frame.type === 'busy-transition')).toEqual([
          { type: 'busy-transition', id: 'r1', busy: false, unread: false },
        ]);
      } finally { socket.destroy(); peer.dispose(); }
    });

    it('carries a non-false unread value through the attach snapshot, and resends it unchanged on a later attach', async () => {
      const peer = new DetachedPeer(
        repoDir, randomUUID(), vi.fn(), vi.fn(), () => { /* no capture pipeline needed for this test */ },
        () => [{ id: 'r1', busy: false, unread: true }],
      );
      await peer.start(vi.fn());
      peer.detach();
      const first: string[] = [];
      const firstSocket = relayPeer(repoDir, peer.session, (data) => { first.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(first.join('')).toContain('busy-transition'));
        const firstFrames = first.join('').trim().split('\n').map((line) => decodeFrame(line));
        expect(firstFrames.filter((frame) => 'type' in frame && frame.type === 'busy-transition')).toEqual([
          { type: 'busy-transition', id: 'r1', busy: false, unread: true },
        ]);
      } finally { firstSocket.destroy(); }
      peer.detach();
      const second: string[] = [];
      const secondSocket = relayPeer(repoDir, peer.session, (data) => { second.push(data); }, vi.fn())!;
      try {
        // The value handed to a fresh attach is not deduped against an earlier attach's identical
        // one — a reattaching client has no prior state of its own to compare against.
        await vi.waitFor(() => expect(second.join('')).toContain('busy-transition'));
        const secondFrames = second.join('').trim().split('\n').map((line) => decodeFrame(line));
        expect(secondFrames.filter((frame) => 'type' in frame && frame.type === 'busy-transition')).toEqual([
          { type: 'busy-transition', id: 'r1', busy: false, unread: true },
        ]);
      } finally { secondSocket.destroy(); peer.dispose(); }
    });
  });
});
