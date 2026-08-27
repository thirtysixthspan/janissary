import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir } from '../workspace/index.js';
import { loadClaudeToken } from '../claude-token.js';
import { loadOpencodeToken } from '../opencode-token.js';
import { spawnPty } from '../pty.js';
import { resolveRemoteRoot } from './serve-root.js';
import { RemoteServer, wireShutdown, CHANNEL_SIGNALS } from './serve.js';
import { encodeFrame } from './protocol.js';
import type { ServerFrame } from './protocol.js';

// Only the process spawners are faked: every other part of this file drives the real server against
// a real clone, and the credential a spawn is handed is the one thing that has no other observable.
vi.mock('../pty.js');

const SPAWN_FRAME = {
  type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
} as const;

let tmpDir: string;
let repoDir: string;
let plainDir: string;
let originlessDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'remote-serve-test-'));
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

  initWorkspaceDir(repoDir);
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
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
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
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-forwarded', githubToken: 'github_pat_forwarded' })}\n`);
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
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-oauth', claudeToken: 'sk-ant-oat01-forwarded' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ claudeToken: 'sk-ant-oat01-forwarded' });
    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('claude token');
    server.shutdown(0);
  });

  it('hands a remote workspace the forwarded OpenCode key and says nothing about it', async () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'opencode-key', opencodeToken: 'oc_live_forwarded' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ opencodeToken: 'oc_live_forwarded' });
    expect(frames.find((f) => f.type === 'workspace-ready')?.notice ?? '').not.toContain('opencode');
    server.shutdown(0);
  });

  it('falls back to the remote\'s own OpenCode key when none is forwarded', async () => {
    const tokenPath = path.join(repoDir, '.janissary', 'opencode-token');
    writeFileSync(tokenPath, 'oc_live_remote_own\n');
    loadOpencodeToken(repoDir);
    try {
      const { server, frames } = makeServer();
      server.receive(`${encodeFrame({ type: 'provision', label: 'opencode-own-key' })}\n`);
      await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
      server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

      expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ opencodeToken: 'oc_live_remote_own' });
      server.shutdown(0);
    } finally {
      rmSync(tokenPath, { force: true });
      loadOpencodeToken(repoDir);
    }
  });

  it('falls back to the remote\'s own Claude token when none is forwarded', async () => {
    const tokenPath = path.join(repoDir, '.janissary', 'claude-token');
    writeFileSync(tokenPath, 'sk-ant-oat01-remote-own\n');
    loadClaudeToken(repoDir);
    try {
      const { server, frames } = makeServer();
      server.receive(`${encodeFrame({ type: 'provision', label: 'claude-own-token' })}\n`);
      await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
      server.receive(`${encodeFrame(SPAWN_FRAME)}\n`);

      expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ claudeToken: 'sk-ant-oat01-remote-own' });
      server.shutdown(0);
    } finally {
      rmSync(tokenPath, { force: true });
      loadClaudeToken(repoDir);
    }
  });

  it('removes the clone when the session ends', async () => {
    const { server, frames, exit } = makeServer();
    server.receive(`${encodeFrame({ type: 'provision', label: 'claude-cleanup' })}\n`);
    await vi.waitFor(() => expect(frames.some((f) => f.type === 'workspace-ready')).toBe(true));
    const dir = frames.find((f) => f.type === 'workspace-ready')!.dir;

    server.shutdown(0);

    expect(existsSync(dir)).toBe(false);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('shuts down only once however many signals arrive', () => {
    const { server, exit } = makeServer();
    server.shutdown(0);
    server.shutdown(0);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  // SIGHUP is what a dropped ssh channel delivers, so it must clean up exactly like a clean exit.
  it('wires every channel-ending signal to the same shutdown', () => {
    const { server, exit } = makeServer();
    const handlers = new Map<string, () => void>();
    wireShutdown(server, (signal, handler) => { handlers.set(signal, handler); });

    expect([...handlers.keys()]).toEqual([...CHANNEL_SIGNALS]);
    handlers.get('SIGHUP')!();
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
});
