import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AcpOptions, AcpRunSnapshot, AcpRunSnapshotRow, PromptHandlers } from '../acp/types.js';
import type * as ServeAcpLoop from './serve-acp-loop.js';
import type { ServerFrame } from './protocol-frames.js';
import * as confinement from '../sandbox/confinement.js';
import { initWorkspaceDir } from '../workspace/index.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { RemoteRunClones } from './serve-run-clones.js';

// `connectAcp` is faked at the module boundary: what this class owns is the frame translation, not
// the ACP client itself (that is exercised end to end in `src/acp/index.test.ts`).
const acpMock = vi.hoisted(() => ({
  options: [] as AcpOptions[],
  prompt: vi.fn(),
  kill: vi.fn(),
  shutdown: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../acp/index.js', () => ({
  connectAcp: vi.fn((options: AcpOptions) => {
    acpMock.options.push(options);
    return { prompt: acpMock.prompt, kill: acpMock.kill, shutdown: acpMock.shutdown, cancel: acpMock.cancel };
  }),
}));

// The far-side loop is spied through so a case can read what `run` handed it while the real loop
// keeps driving every other case.
const loopMock = vi.hoisted(() => ({ startRemoteLoop: vi.fn() }));
vi.mock('./serve-acp-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ServeAcpLoop>();
  loopMock.startRemoteLoop.mockImplementation(actual.startRemoteLoop);
  return { ...actual, startRemoteLoop: loopMock.startRemoteLoop };
});

import { RemoteAcp } from './serve-acp.js';

const block = (command: string): string => '```janissary\n' + command + '\n```';
const WORKSPACE = '/srv/proj/.janissary/workspace/bekir';

const OPEN = {
  type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
  env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
} as const;

function makeAcp(tokens = {}, workspace = WORKSPACE, lookup?: RemoteRunClones['lookup']) {
  const frames: ServerFrame[] = [];
  const acp = new RemoteAcp((frame) => { frames.push(frame); }, workspace, tokens, lookup);
  return { acp, frames };
}

function cloneService() {
  initWorkspaceDir(WORKSPACE);
  const tracked = new Set<string>();
  const handles: PromiseWithResolvers<void>[] = [];
  const manager = {
    create: vi.fn((label: string) => {
      const settle = Promise.withResolvers<void>();
      handles.push(settle);
      const dir = path.join(WORKSPACE, label);
      tracked.add(dir);
      return { dir, ready: settle.promise, cancel: vi.fn() };
    }),
    tracks: vi.fn((dir: string) => tracked.has(dir)),
    remove: vi.fn((dir: string) => { tracked.delete(dir); }),
    cancel: vi.fn(),
  } as unknown as WorkspaceManager;
  return { service: new RemoteRunClones(manager, {}, 'main'), handles };
}

async function stateLookup(state: 'pending' | 'releasing' | 'released' | 'stopping'): Promise<RemoteRunClones['lookup']> {
  const { service, handles } = cloneService();
  if (state === 'stopping') {
    service.stop();
    return (label) => service.lookup(label);
  }
  const created = service.create('the-clone');
  await vi.waitFor(() => expect(handles).toHaveLength(1));
  if (state === 'pending') return (label) => service.lookup(label);
  handles[0]!.resolve();
  await created;
  if (state === 'releasing') void service.release('the-clone');
  else await service.release('the-clone');
  return (label) => service.lookup(label);
}

type CoreSnapshot = Extract<AcpRunSnapshot, { kind: 'core' }>;

function coreSnapshot(
  role: 'ask' | 'tell', grants: string[], rows: AcpRunSnapshotRow[] = [], withoutTools = false,
): CoreSnapshot {
  return { kind: 'core', role, roleName: role, grants, rows, withoutTools };
}

const RUN_FRAME = {
  type: 'acp-run', id: 'racp1', text: 'do it',
  snapshot: coreSnapshot('tell', ['file read', 'db sqlite query']),
} as const;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The handlers `RemoteAcp` gave the faked session for its most recent prompt.
function lastHandlers(): PromptHandlers {
  return acpMock.prompt.mock.calls.at(-1)![1] as PromptHandlers;
}

let workspace: string;
let clone: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-'));
  clone = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-clone-'));
  vi.spyOn(confinement, 'sandboxWillConfine').mockReturnValue(true);
  acpMock.options.length = 0;
  acpMock.prompt.mockReset();
  acpMock.kill.mockReset();
  acpMock.shutdown.mockReset().mockResolvedValue(undefined);
  acpMock.cancel.mockReset().mockResolvedValue(undefined);
  loopMock.startRemoteLoop.mockClear();
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(clone, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('RemoteAcp — opening a session', () => {
  it('emits a ready frame once the handshake completes', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp1', sandboxed: true }]);
  });

  it.each([false, true])('reports the remote host confinement result: %s', (sandboxed) => {
    vi.spyOn(confinement, 'sandboxWillConfine').mockReturnValue(sandboxed);
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp1', sandboxed }]);
    expect(confinement.sandboxWillConfine).toHaveBeenCalledWith(WORKSPACE);
  });

  // The provider id arrives before effort setup, so it is its own frame rather than waiting for
  // readiness. A no-ID open keeps the original ready shape.
  it.each([false, true])('reports the provider id immediately, then carries it on ready: %s', (sandboxed) => {
    vi.spyOn(confinement, 'sandboxWillConfine').mockReturnValue(sandboxed);
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acpMock.options[0].onSessionStarted?.('session-exact-id');

    expect(frames).toEqual([{ type: 'acp-session-started', id: 'racp1', sessionId: 'session-exact-id' }]);

    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(frames).toEqual([
      { type: 'acp-session-started', id: 'racp1', sessionId: 'session-exact-id' },
      { type: 'acp-ready', id: 'racp1', sandboxed, sessionId: 'session-exact-id' },
    ]);
  });

  it('keeps an already-emitted id when effort setup fails without inventing readiness', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acpMock.options[0].onSessionStarted?.('session-exact-id');
    acpMock.options[0].onError('unsupported effort "absent"');

    expect(frames).toContainEqual({ type: 'acp-session-started', id: 'racp1', sessionId: 'session-exact-id' });
    expect(frames.filter((frame) => frame.type === 'acp-ready')).toEqual([]);
  });

  it('keeps the captured id separate across two simultaneous opens', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });
    acpMock.options[0].onSessionStarted?.('first-provider');
    acpMock.options[1].onSessionStarted?.('second-provider');
    acpMock.options[1].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(frames).toEqual([
      { type: 'acp-session-started', id: 'racp1', sessionId: 'first-provider' },
      { type: 'acp-session-started', id: 'racp2', sessionId: 'second-provider' },
      { type: 'acp-ready', id: 'racp2', sandboxed: true, sessionId: 'second-provider' },
    ]);
  });

  it('applies autonomous policy and forwards typed activity to the run id', () => {
    const { acp, frames } = makeAcp();
    const options = {
      ...OPEN, autonomous: true as const, effort: { level: 'high', model: 'google/gemini-3.1-flash-lite' },
    };
    acp.open(options);
    const acpOptions = acpMock.options[0];
    acpOptions.onActivity?.({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Planning.' } });

    expect(acpOptions).toMatchObject({ autonomous: true, effort: options.effort });
    expect(frames).toEqual([{ type: 'acp-activity', id: 'racp1', kind: 'thought', text: 'Planning.' }]);
  });

  // Both, so the agent sees the files the tab is working on and is confined to the clone exactly as
  // this server's other workspaced processes are.
  it('runs the agent in the provisioned workspace as both cwd and sandbox root', () => {
    const { acp } = makeAcp();

    acp.open(OPEN);

    expect(acpMock.options[0]).toMatchObject({
      command: 'opencode',
      args: ['acp'],
      cwd: WORKSPACE,
      workspaceDir: WORKSPACE,
      offline: false,
      env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' },
    });
  });

  it('hands the frame\'s session options to the agent connection', () => {
    const { acp } = makeAcp();
    const sessionMeta = { claudeCode: { options: { tools: [] } } };

    acp.open({ ...OPEN, sessionMeta });

    expect(acpMock.options[0].sessionMeta).toEqual(sessionMeta);
  });

  it('leaves the session options unset when the frame carries none', () => {
    const { acp } = makeAcp();

    acp.open(OPEN);

    expect(acpMock.options[0].sessionMeta).toBeUndefined();
  });

  // The forwarded-over-own map this server already computed. Reading its own credentials instead
  // would drop a forwarded key for exactly the sessions that need it most.
  it('injects the merged token map, with a forwarded token beating the remote\'s own', () => {
    const { acp } = makeAcp({ github: 'remote-own', opencode: 'oc_live_forwarded' });

    acp.open(OPEN);

    expect(acpMock.options[0].tokens).toEqual({ github: 'remote-own', opencode: 'oc_live_forwarded' });
  });

  it('ignores a duplicate open for an id that is already live', () => {
    const { acp } = makeAcp();

    acp.open(OPEN);
    acp.open(OPEN);

    expect(acpMock.options).toHaveLength(1);
  });

  it('accepts a new session for an id after its prior session was released', async () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    await acp.close('racp1');

    acp.open(OPEN);

    expect(acpMock.options).toHaveLength(2);
  });

  // One `remote-serve` serves every tab sharing its channel — the launching tab and each agent
  // joined from it through ➕ — so their sessions arrive here together and must not displace one
  // another. Each carries its own id, minted by the local side.
  it('holds one session per id, so tabs sharing a channel each get their own agent', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });
    acpMock.options[1].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(acpMock.options).toHaveLength(2);
    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp2', sandboxed: true }]);
  });
});

describe('RemoteAcp — workspace selectors', () => {
  it.each([false, true])('opens a selected clone as cwd, workspace root and confinement root: %s', (sandboxed) => {
    vi.spyOn(confinement, 'sandboxWillConfine').mockReturnValue(sandboxed);
    const { acp, frames } = makeAcp({}, WORKSPACE, (label) => label === 'agent-run1' ? clone : undefined);

    acp.open({ ...OPEN, workspace: 'agent-run1' });
    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(acpMock.options[0]).toMatchObject({ cwd: clone, workspaceDir: clone });
    expect(confinement.sandboxWillConfine).toHaveBeenCalledWith(clone);
    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp1', sandboxed }]);
  });

  it('uses the main directory when the selector is absent even with a lookup available', () => {
    const lookup = vi.fn(() => clone);
    const { acp } = makeAcp({}, WORKSPACE, lookup);

    acp.open(OPEN);

    expect(acpMock.options[0]).toMatchObject({ cwd: WORKSPACE, workspaceDir: WORKSPACE });
    expect(lookup).not.toHaveBeenCalled();
    expect(confinement.sandboxWillConfine).toHaveBeenCalledWith(WORKSPACE);
  });

  it('keeps two transport ids on their own selected clones', () => {
    const other = path.join(WORKSPACE, 'other');
    const { acp } = makeAcp({}, WORKSPACE, (label) => label === 'first' ? clone : label === 'second' ? other : undefined);

    acp.open({ ...OPEN, id: 'first', workspace: 'first' });
    acp.open({ ...OPEN, id: 'second', workspace: 'second' });

    expect(acpMock.options[0]).toMatchObject({ cwd: clone });
    expect(acpMock.options[1]).toMatchObject({ cwd: other });
  });

  it('keeps a live session on its original clone after the lookup changes', async () => {
    writeFileSync(path.join(clone, 'which.md'), 'from clone');
    writeFileSync(path.join(workspace, 'which.md'), 'from other');
    let selected = clone;
    const { acp, frames } = makeAcp({}, WORKSPACE, () => selected);

    acp.open({ ...OPEN, workspace: 'sel' });
    acp.run(RUN_FRAME);
    lastHandlers().onChunk(block('file read which.md'));
    lastHandlers().onEnd('end_turn');
    await flush();
    expect(frames.filter((frame) => frame.type === 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: 'racp1', command: 'file read which.md', result: '1\tfrom clone', workspace: true },
    ]);

    selected = workspace;
    acp.run(RUN_FRAME);
    lastHandlers().onChunk(block('file read which.md'));
    lastHandlers().onEnd('end_turn');
    await flush();
    expect(frames.filter((frame) => frame.type === 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: 'racp1', command: 'file read which.md', result: '1\tfrom clone', workspace: true },
      { type: 'acp-tool-step', id: 'racp1', command: 'file read which.md', result: '1\tfrom clone', workspace: true },
    ]);
  });

  it('refuses an unknown or path-shaped selector before confinement or connect', () => {
    const { service } = cloneService();
    for (const label of ['nope', '../escape']) {
      vi.mocked(confinement.sandboxWillConfine).mockClear();
      acpMock.options.length = 0;
      const { acp, frames } = makeAcp({}, WORKSPACE, (candidate) => service.lookup(candidate));

      acp.open({ ...OPEN, workspace: label });

      expect(frames).toEqual([{
        type: 'acp-error', id: 'racp1', message: `Unknown remote run clone "${label}".`, fatal: true,
      }]);
      expect(acpMock.options).toHaveLength(0);
      expect(confinement.sandboxWillConfine).not.toHaveBeenCalled();
    }
  });

  it('refuses a selector when no lookup callback was injected', () => {
    vi.mocked(confinement.sandboxWillConfine).mockClear();
    const { acp, frames } = makeAcp();

    acp.open({ ...OPEN, workspace: 'agent-run1' });

    expect(frames).toEqual([{
      type: 'acp-error', id: 'racp1', message: 'Unknown remote run clone "agent-run1".', fatal: true,
    }]);
    expect(acpMock.options).toHaveLength(0);
    expect(confinement.sandboxWillConfine).not.toHaveBeenCalled();
  });

  it.each(['pending', 'releasing', 'released', 'stopping'] as const)(
    'refuses a %s clone through the real lookup contract before confinement or connect', async (state) => {
      const lookup = await stateLookup(state);
      vi.mocked(confinement.sandboxWillConfine).mockClear();
      const { acp, frames } = makeAcp({}, WORKSPACE, lookup);

      acp.open({ ...OPEN, workspace: 'the-clone' });

      expect(frames).toEqual([{
        type: 'acp-error', id: 'racp1', message: 'Unknown remote run clone "the-clone".', fatal: true,
      }]);
      expect(acpMock.options).toHaveLength(0);
      expect(confinement.sandboxWillConfine).not.toHaveBeenCalled();
    },
  );

  it('ignores a duplicate open that carries another selector', () => {
    const { acp } = makeAcp({}, WORKSPACE, (label) => label === 'agent-run1' ? clone : undefined);

    acp.open({ ...OPEN, workspace: 'agent-run1' });
    acp.open({ ...OPEN, workspace: 'other' });

    expect(acpMock.options).toHaveLength(1);
  });

  it('lets a refused id open successfully later', () => {
    const { acp, frames } = makeAcp({}, WORKSPACE, (label) => label === 'agent-run1' ? clone : undefined);

    acp.open({ ...OPEN, workspace: 'nope' });
    frames.length = 0;
    acp.open({ ...OPEN, workspace: 'agent-run1' });

    expect(frames).toEqual([]);
    expect(acpMock.options).toHaveLength(1);
  });

  it('lets a closed id select a new directory', async () => {
    const { acp } = makeAcp({}, WORKSPACE, (label) => label === 'first' ? clone : label === 'second' ? workspace : undefined);

    acp.open({ ...OPEN, workspace: 'first' });
    await acp.close('racp1');
    acp.open({ ...OPEN, workspace: 'second' });

    expect(acpMock.options[0]).toMatchObject({ cwd: clone });
    expect(acpMock.options[1]).toMatchObject({ cwd: workspace });
  });

  it('reports the provider id then readiness on a selected session without autonomous mode', () => {
    const { acp, frames } = makeAcp({}, WORKSPACE, (label) => label === 'agent-run1' ? clone : undefined);

    acp.open({ ...OPEN, workspace: 'agent-run1' });
    acpMock.options[0].onSessionStarted?.('provider-id');
    expect(frames).toEqual([{ type: 'acp-session-started', id: 'racp1', sessionId: 'provider-id' }]);

    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });
    expect(frames.at(-1)).toEqual({ type: 'acp-ready', id: 'racp1', sandboxed: true, sessionId: 'provider-id' });
    expect(acpMock.options[0].autonomous).toBeUndefined();
  });
});

describe('RemoteAcp — prompting', () => {
  it('contains cancellation rejection as a session-local fatal error', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acpMock.cancel.mockRejectedValue(new Error('write failed'));
    acp.cancel('racp1');
    await Promise.resolve();
    expect(frames).toEqual([{ type: 'acp-error', id: 'racp1', message: 'ACP: cancellation failed: write failed', fatal: true }]);
  });
  // The split the whole design rests on. A rate limit clears on its own, so the session keeps its
  // accumulated conversation; a dead agent does not, so the local side must forget it.
  it('emits a non-fatal error for a failed run and a fatal one for a dead session', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run(RUN_FRAME);

    lastHandlers().onError('rate limited');
    acpMock.options[0].onError('ACP agent exited.');

    expect(frames.filter((frame) => frame.type === 'acp-error')).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false },
      { type: 'acp-error', id: 'racp1', message: 'ACP agent exited.', fatal: true },
    ]);
  });
});

describe('RemoteAcp — running', () => {
  it('starts the far-side loop with the merged tokens', () => {
    const { acp } = makeAcp({ tavily: 'tvly-x' });
    acp.open(OPEN);

    acp.run(RUN_FRAME);

    expect(loopMock.startRemoteLoop).toHaveBeenCalledOnce();
    expect(loopMock.startRemoteLoop.mock.calls[0]?.[3]).toEqual({ tavily: 'tvly-x' });
  });

  it('runs a live session end to end and feeds a caller result into the next prompt', async () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\ntwo\n');
    const { acp, frames } = makeAcp({}, workspace);
    acp.open(OPEN);

    acp.run(RUN_FRAME);

    lastHandlers().onChunk(block('file read a.md'));
    lastHandlers().onEnd('end_turn');
    await flush();

    expect(frames.filter((frame) => frame.type === 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: 'racp1', command: 'file read a.md', result: '1\tone\n2\ttwo', workspace: true },
    ]);

    lastHandlers().onChunk(block('db sqlite query movies SELECT 1'));
    lastHandlers().onEnd('end_turn');
    await flush();

    expect(frames.filter((frame) => frame.type === 'acp-tool-request')).toEqual([
      { type: 'acp-tool-request', id: 'racp1', request: 1, command: 'db sqlite query movies SELECT 1' },
    ]);

    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: '42' });
    await flush();

    expect(acpMock.prompt.mock.calls[2][0]).toContain('Output of `db sqlite query movies SELECT 1`:\n42');

    lastHandlers().onChunk('Done.');
    lastHandlers().onEnd('end_turn');
    await flush();

    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: 'racp1', reason: 'answered' });
  });

  it('refuses a run for a missing or closed session', async () => {
    const { acp, frames } = makeAcp();

    acp.run({ ...RUN_FRAME, id: 'racp9' });

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp9', message: 'No remote ACP session is open.', fatal: true },
    ]);

    acp.open(OPEN);
    await acp.close('racp1');
    frames.length = 0;

    acp.run(RUN_FRAME);

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'No remote ACP session is open.', fatal: true },
    ]);
    expect(acpMock.prompt).not.toHaveBeenCalled();
  });

  it('refuses a second run while the first is still in flight', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    acp.run(RUN_FRAME);
    acp.run(RUN_FRAME);

    expect(frames.filter((frame) => frame.type === 'acp-error')).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'ACP: a prompt is already running.', fatal: false },
    ]);
    expect(acpMock.prompt).toHaveBeenCalledOnce();
  });

  it('ignores a tool result for a live session with no run and after its run has ended', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    expect(() => acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: '42' })).not.toThrow();
    expect(frames).toEqual([]);

    acp.run(RUN_FRAME);
    lastHandlers().onChunk('Done.');
    lastHandlers().onEnd('end_turn');
    await flush();
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: 'racp1', reason: 'answered' });

    const before = frames.length;
    expect(() => acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: 'late' })).not.toThrow();
    expect(frames).toHaveLength(before);
  });

  it('admits another run after the first ends with acp-run-end', async () => {
    const { acp } = makeAcp();
    acp.open(OPEN);

    acp.run(RUN_FRAME);
    lastHandlers().onChunk('Done.');
    lastHandlers().onEnd('end_turn');
    await flush();

    acp.run(RUN_FRAME);

    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
  });

  it('admits another run after a caller error is delivered as a tool step', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run({ ...RUN_FRAME, snapshot: coreSnapshot('tell', ['db sqlite query']) });

    lastHandlers().onChunk(block('db sqlite query movies SELECT 1'));
    lastHandlers().onEnd('end_turn');
    await flush();

    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, error: 'database unavailable' });
    await vi.waitFor(() => expect(acpMock.prompt).toHaveBeenCalledTimes(2));
    lastHandlers().onChunk('Done.');
    lastHandlers().onEnd('end_turn');
    await flush();

    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: 'racp1', reason: 'answered' });
    expect(frames.some((frame) => frame.type === 'acp-error')).toBe(false);

    acp.run(RUN_FRAME);

    expect(acpMock.prompt).toHaveBeenCalledTimes(3);
  });

  it('leaves no stale run handle when the loop finishes during startRemoteLoop', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acpMock.prompt.mockImplementation((_text: string, handlers: PromptHandlers) => {
      handlers.onChunk('Done.');
      handlers.onEnd('end_turn');
    });

    acp.run(RUN_FRAME);
    acp.run(RUN_FRAME);

    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
  });
});

describe('RemoteAcp — cancelling, closing, and losing a run', () => {
  it('cancels a running loop only after the provider cancellation settles', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    const cancellation = Promise.withResolvers<void>();
    acpMock.cancel.mockReturnValue(cancellation.promise);
    acp.run(RUN_FRAME);

    acp.cancel('racp1');
    await flush();
    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toEqual([]);
    expect(acpMock.cancel).toHaveBeenCalledOnce();

    cancellation.resolve();
    await flush();
    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toEqual([
      { type: 'acp-run-end', id: 'racp1', reason: 'cancelled' },
    ]);

    const before = frames.length;
    const prompts = acpMock.prompt.mock.calls.length;
    lastHandlers().onEnd('cancelled');
    await flush();

    expect(frames).toHaveLength(before);
    expect(acpMock.prompt).toHaveBeenCalledTimes(prompts);
  });

  it('cancels between turns with a caller result pending', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run({ ...RUN_FRAME, snapshot: coreSnapshot('tell', ['db sqlite query']) });
    lastHandlers().onChunk(block('db sqlite query movies SELECT 1'));
    lastHandlers().onEnd('end_turn');
    await flush();
    expect(frames.filter((frame) => frame.type === 'acp-tool-request')).toHaveLength(1);

    acp.cancel('racp1');
    await flush();
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: 'racp1', reason: 'cancelled' });
    const prompts = acpMock.prompt.mock.calls.length;

    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: 'late' });
    await flush();

    expect(acpMock.prompt).toHaveBeenCalledTimes(prompts);
    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toHaveLength(1);
  });

  it('reports a failed run cancellation as fatal and admits another run', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acpMock.cancel.mockRejectedValue(new Error('write failed'));
    acp.run(RUN_FRAME);

    acp.cancel('racp1');
    await flush();

    expect(frames.filter((frame) => frame.type === 'acp-error')).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'ACP: cancellation failed: write failed', fatal: true },
    ]);
    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toEqual([]);

    acp.run(RUN_FRAME);
    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
  });

  it('closes a running loop without a run-end or a cancel', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run({ ...RUN_FRAME, snapshot: coreSnapshot('tell', ['db sqlite query']) });
    lastHandlers().onChunk(block('db sqlite query movies SELECT 1'));
    lastHandlers().onEnd('end_turn');
    await flush();

    await acp.close('racp1');

    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toEqual([]);
    expect(frames.filter((frame) => frame.type === 'acp-error')).toEqual([]);
    expect(frames.at(-1)).toEqual({ type: 'acp-closed', id: 'racp1', released: true });
    expect(acpMock.cancel).not.toHaveBeenCalled();

    const before = frames.length;
    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: 'late' });
    expect(frames).toHaveLength(before);
  });

  it('disposes a running loop without a frame or a cancel', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run(RUN_FRAME);
    const before = frames.length;

    await acp.dispose();

    expect(frames).toHaveLength(before);
    expect(acpMock.shutdown).toHaveBeenCalledOnce();
    expect(acpMock.cancel).not.toHaveBeenCalled();
  });

  it('ends a running tab session and an idle run-only session on detach but preserves an idle tab session', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });
    acp.open({ ...OPEN, id: 'run-1', autonomous: true });

    acp.run({ ...RUN_FRAME, id: 'racp2' });
    acp.detachRuns();

    expect(acpMock.shutdown).toHaveBeenCalledTimes(2);
  });

  it('ends a run on a fatal connection error and admits another run', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run({ ...RUN_FRAME, snapshot: coreSnapshot('tell', ['db sqlite query']) });
    lastHandlers().onChunk(block('db sqlite query movies SELECT 1'));
    lastHandlers().onEnd('end_turn');
    await flush();

    acpMock.options[0].onError('ACP agent exited.');
    await flush();

    expect(frames.filter((frame) => frame.type === 'acp-error')).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'ACP agent exited.', fatal: true },
    ]);
    expect(frames.filter((frame) => frame.type === 'acp-run-end')).toEqual([]);

    const before = frames.length;
    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, output: 'late' });
    expect(frames).toHaveLength(before);

    acp.run(RUN_FRAME);
    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
  });
});

describe('RemoteAcp — closing', () => {
  it('awaits shutdown once and is safe to call twice', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    await acp.close('racp1');
    await acp.close('racp1');

    expect(acpMock.shutdown).toHaveBeenCalledTimes(1);
    expect(frames).toEqual([
      { type: 'acp-closed', id: 'racp1', released: true },
      { type: 'acp-closed', id: 'racp1', released: true },
    ]);
  });

  it('acknowledges release only after process shutdown has settled', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    const shutdown = Promise.withResolvers<void>();
    acpMock.shutdown.mockImplementation(() => shutdown.promise);

    const closing = acp.close('racp1');
    await Promise.resolve();

    expect(frames).toEqual([]);
    shutdown.resolve();
    await closing;

    expect(frames).toEqual([{ type: 'acp-closed', id: 'racp1', released: true }]);
  });

  it('forwards a late connection error after the session has closed', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    await acp.close('racp1');

    acpMock.options[0].onError('late exit');

    expect(frames.at(-1)).toEqual({ type: 'acp-error', id: 'racp1', message: 'late exit', fatal: true });
  });

  it('sends a negative acknowledgment when process shutdown times out', async () => {
    vi.useFakeTimers();
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acpMock.shutdown.mockReturnValue(new Promise<void>(() => {}));

    const closing = acp.close('racp1');
    await vi.advanceTimersByTimeAsync(5000);
    await closing;

    expect(frames).toEqual([{ type: 'acp-closed', id: 'racp1', released: false }]);
    await acp.close('racp1');
    expect(frames.at(-1)).toEqual({ type: 'acp-closed', id: 'racp1', released: false });
  });

  it('keeps the last close outcome when dispose later releases a timed-out session', async () => {
    vi.useFakeTimers();
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acpMock.shutdown.mockReturnValueOnce(new Promise<void>(() => {})).mockResolvedValue(undefined);

    const closing = acp.close('racp1');
    await vi.advanceTimersByTimeAsync(5000);
    await closing;
    await acp.dispose();
    await acp.close('racp1');

    expect(acpMock.shutdown).toHaveBeenCalledTimes(2);
    expect(frames.at(-1)).toEqual({ type: 'acp-closed', id: 'racp1', released: false });
    acp.open(OPEN);
    expect(acpMock.options).toHaveLength(2);
  });

  it('shares one in-flight shutdown across concurrent close requests', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    const shutdown = Promise.withResolvers<void>();
    acpMock.shutdown.mockImplementation(() => shutdown.promise);

    const first = acp.close('racp1');
    const second = acp.close('racp1');
    await Promise.resolve();
    expect(acpMock.shutdown).toHaveBeenCalledOnce();
    expect(frames).toEqual([]);
    shutdown.resolve();
    await Promise.all([first, second]);

    expect(frames).toEqual([
      { type: 'acp-closed', id: 'racp1', released: true },
      { type: 'acp-closed', id: 'racp1', released: true },
    ]);
  });

  it('leaves another session\'s id alone', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);

    acp.close('racp2');

    expect(acpMock.kill).not.toHaveBeenCalled();
  });

  it('disposes the live session once and is safe to call twice', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    await acp.dispose();
    await acp.dispose();

    expect(acpMock.shutdown).toHaveBeenCalledTimes(1);
    expect(frames).toEqual([]);
  });

  // Shutdown takes every tab's agent with it, not only the first one opened.
  it('disposes every live session', async () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });

    await acp.dispose();

    expect(acpMock.shutdown).toHaveBeenCalledTimes(2);
  });

  it('accepts a fresh open after the previous session was closed', async () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    await acp.close('racp1');

    acp.open({ ...OPEN, id: 'racp2' });

    expect(acpMock.options).toHaveLength(2);
  });

  it('ends autonomous run-only sessions on transport detach but preserves ordinary ACP sessions', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'run-1', autonomous: true });

    acp.detachRuns();

    expect(acpMock.shutdown).toHaveBeenCalledOnce();
  });
});
