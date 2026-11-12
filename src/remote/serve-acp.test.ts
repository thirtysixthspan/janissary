import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AcpOptions, AcpRunSnapshot, AcpRunSnapshotRow, PromptHandlers } from '../acp/types.js';
import type { ServerFrame } from './protocol-frames.js';
import * as confinement from '../sandbox/confinement.js';

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

import { RemoteAcp } from './serve-acp.js';

const WORKSPACE = '/srv/proj/.janissary/workspace/bekir';

const OPEN = {
  type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
  env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
} as const;

function makeAcp(tokens = {}, workspace = WORKSPACE) {
  const frames: ServerFrame[] = [];
  const acp = new RemoteAcp((frame) => { frames.push(frame); }, workspace, tokens);
  return { acp, frames };
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

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-'));
  vi.spyOn(confinement, 'sandboxWillConfine').mockReturnValue(true);
  acpMock.options.length = 0;
  acpMock.prompt.mockReset();
  acpMock.kill.mockReset();
  acpMock.shutdown.mockReset().mockResolvedValue(undefined);
  acpMock.cancel.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
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

describe('RemoteAcp — prompting', () => {
  it('delegates cancellation to a live addressed holder and preserves its original terminal frame', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'held' });
    acp.cancel('missing');
    acp.cancel('racp1');
    expect(acpMock.cancel).toHaveBeenCalledOnce();
    expect(frames).toEqual([]);
    lastHandlers().onEnd('cancelled');
    expect(frames).toEqual([{ type: 'acp-end', id: 'racp1', stopReason: 'cancelled' }]);
    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'next' });
    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
    await acp.close('racp1');
    acp.cancel('racp1');
    expect(acpMock.cancel).toHaveBeenCalledOnce();
  });

  it('contains cancellation rejection as a session-local fatal error', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acpMock.cancel.mockRejectedValue(new Error('write failed'));
    acp.cancel('racp1');
    await Promise.resolve();
    expect(frames).toEqual([{ type: 'acp-error', id: 'racp1', message: 'ACP: cancellation failed: write failed', fatal: true }]);
  });
  it('emits a chunk frame per chunk and an end frame on completion', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'summarize this' });
    lastHandlers().onChunk('first ');
    lastHandlers().onChunk('second');
    lastHandlers().onEnd('end_turn');

    expect(acpMock.prompt.mock.calls[0][0]).toBe('summarize this');
    expect(frames).toEqual([
      { type: 'acp-chunk', id: 'racp1', text: 'first ' },
      { type: 'acp-chunk', id: 'racp1', text: 'second' },
      { type: 'acp-end', id: 'racp1', stopReason: 'end_turn' },
    ]);
  });

  // The split the whole design rests on. A rate limit clears on its own, so the session keeps its
  // accumulated conversation; a dead agent does not, so the local side must forget it.
  it('emits a non-fatal error for a failed prompt and a fatal one for a dead session', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'hi' });

    lastHandlers().onError('rate limited');
    acpMock.options[0].onError('ACP agent exited.');

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false },
      { type: 'acp-error', id: 'racp1', message: 'ACP agent exited.', fatal: true },
    ]);
  });

  // Silently dropping it would leave the local side waiting on a reply that is never coming.
  it('emits a fatal error for a prompt addressed to an unknown session', () => {
    const { acp, frames } = makeAcp();

    acp.prompt({ type: 'acp-prompt', id: 'racp9', text: 'hi' });

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp9', message: 'No remote ACP session is open.', fatal: true },
    ]);
    expect(acpMock.prompt).not.toHaveBeenCalled();
  });

  it('emits a fatal error for a prompt addressed to an id that was closed', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.close('racp1');

    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'hi' });

    expect(frames.at(-1)).toEqual({ type: 'acp-error', id: 'racp1', message: 'No remote ACP session is open.', fatal: true });
  });

  // Two tabs sharing one channel: each prompt reaches its own agent, and each reply carries the id
  // that routes it back to the tab that asked.
  it('routes a prompt to the session its id names', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });

    acp.prompt({ type: 'acp-prompt', id: 'racp2', text: 'hi' });
    lastHandlers().onEnd('end_turn');

    expect(frames).toEqual([{ type: 'acp-end', id: 'racp2', stopReason: 'end_turn' }]);
  });
});

describe('RemoteAcp — running', () => {
  it('runs a live session end to end and feeds a caller result into the next prompt', async () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\ntwo\n');
    const { acp, frames } = makeAcp({}, workspace);
    acp.open(OPEN);

    acp.run(RUN_FRAME);

    lastHandlers().onChunk('file read a.md');
    lastHandlers().onEnd('end_turn');
    await flush();

    expect(frames.filter((frame) => frame.type === 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: 'racp1', command: 'file read a.md', result: '1\tone\n2\ttwo', workspace: true },
    ]);

    lastHandlers().onChunk('db sqlite query movies SELECT 1');
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

  it('admits another run after a caller result ends the first with acp-error', async () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.run({ ...RUN_FRAME, snapshot: coreSnapshot('tell', ['db sqlite query']) });

    lastHandlers().onChunk('db sqlite query movies SELECT 1');
    lastHandlers().onEnd('end_turn');
    await flush();

    acp.toolResult({ type: 'acp-tool-result', id: 'racp1', request: 1, error: 'database unavailable' });
    await flush();

    expect(frames.at(-1)).toEqual({ type: 'acp-error', id: 'racp1', message: 'database unavailable', fatal: false });

    acp.run(RUN_FRAME);

    expect(acpMock.prompt).toHaveBeenCalledTimes(2);
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
    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'still live' });
    acp.prompt({ type: 'acp-prompt', id: 'run-1', text: 'ended' });
    expect(acpMock.prompt).toHaveBeenCalledOnce();
  });
});
