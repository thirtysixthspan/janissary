import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir } from '../workspace/index.js';
import { loadProjectTokens } from '../project/tokens.js';
import { loadGitIdentity, getGitIdentity } from '../git/identity.js';
import { spawnPty } from '../pty.js';
import { resolveRemoteRoot } from './serve-root.js';
import { RemoteServer, wireShutdown, CHANNEL_SIGNALS } from './serve.js';
import { encodeFrame, decodeFrame, parseHandshake } from './protocol.js';
import type { ServerFrame } from './protocol.js';
import { DetachedPeer, relayPeer, REMOTE_DETACH_TIMEOUT_MS } from './serve-detach.js';
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

  // The question a reattaching janissary asks, and the only way it learns what to open a tab for.
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

  // A peer that has not provisioned is holding nothing, which is a fact worth stating: answering
  // with the provisioning refusal instead would read to the local side as an unreachable host.
  it('answers an empty list before a workspace exists rather than refusing', () => {
    const { server, frames } = makeServer();
    server.receive(`${encodeFrame({ type: 'session-state' })}\n`);
    expect(frames).toEqual([{ type: 'session-state-result', processes: [] }]);
  });
});
describe('detached peer rendezvous', () => {
  it.each(['pipe', 'pty'] as const)('keeps a real %s shell and workspace through EOF and SIGHUP and a fresh remote-serve process', async (mode) => {
    const script = `
      import { RemoteServer } from ${JSON.stringify(new URL('serve.ts', import.meta.url).href)};
      import { initWorkspaceDir } from ${JSON.stringify(new URL('../workspace/index.ts', import.meta.url).href)};
      import { getConfig } from ${JSON.stringify(new URL('../config.ts', import.meta.url).href)};
      getConfig().sandboxWorkspaces = false;
      initWorkspaceDir(process.argv[1], process.argv[1] + '/absent-config');
      new RemoteServer(process.argv[1]).listen();
    `;
    const start = () => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, repoDir]);
      let buffer = '';
      const lines: string[] = [];
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          lines.push(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
      });
      child.stderr.resume();
      return { child, lines, send: (frame: Parameters<typeof encodeFrame>[0]) => child.stdin.write(`${encodeFrame(frame)}\n`) };
    };
    const peer = start();
    let proxy: ReturnType<typeof start> | undefined;
    const stop = async (child: ReturnType<typeof spawn>) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
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
      peer.child.stdin.end(); peer.child.kill('SIGHUP');
      proxy = start();
      const restored = proxy;
      await vi.waitFor(() => expect(restored.lines[0]).toContain('__JANUS_REMOTE__'), { timeout: 10_000 });
      restored.send({ type: 'reattach', session: handshake.session });
      await vi.waitFor(() => expect(restored.lines.join('\n')).toContain('"accepted":true'));
      restored.send({ type: 'input', id: 'shell', data: 'printf "after:%s\\n" "$$"\n' });
      await vi.waitFor(() => expect(outputs(restored.lines)).toContain(`after:${shellPid}`));
      expect(peer.child.exitCode).toBeNull();
      expect(existsSync(path.join(repoDir, '.janissary', 'workspace', 'real-sleep-shell'))).toBe(true);
    } finally {
      if (proxy) await stop(proxy.child);
      await stop(peer.child);
    }
    expect(existsSync(path.join(repoDir, '.janissary', 'workspace', 'real-sleep-shell'))).toBe(false);
  }, 30_000);
  it('reattaches over a private socket, replays missed state once, and drops PTY output', async () => {
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
      expect(frames.map((frame) => frame.type)).toEqual(['reattach-result', 'transcript', 'transcript', 'acp-chunk', 'acp-end', 'output']);
      expect(frames.at(-1).id).toBe('shell');
      socket.write(`${encodeFrame({ type: 'input', id: 'r1', data: 'new input' })}\n`);
      await vi.waitFor(() => expect(received).toHaveBeenCalledWith(expect.stringContaining('input')));
      socket.destroy(); await vi.waitFor(() => expect(ended).toHaveBeenCalled());
      output.length = 0;
      const again = relayPeer(repoDir, peer.session, (data) => { output.push(data); }, vi.fn())!;
      try {
        await vi.waitFor(() => expect(output.join('')).toContain('reattach-result'));
        expect(output.join('').trim().split('\n')).toHaveLength(1);
      } finally { again.destroy(); }
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
      await vi.waitFor(() => expect(output.join('')).toContain('reattach-result'));
      const frames = output.join('').trim().split('\n').map((line) => decodeFrame(line));
      expect(frames[0]).toMatchObject({ type: 'reattach-result', accepted: true, truncated: true });
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
      socket.write(`${encodeFrame({ type: 'reattach', session: randomUUID() })}\n`);
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

  it('expires an unreattached peer and cleans up its workspace', async () => {
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
});
