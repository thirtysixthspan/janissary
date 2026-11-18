import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DriveLoop from '../acp/drive-loop.js';
import type { AcpSession, AcpLoopHandlers, AcpPromptHandlers } from '../acp/types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AgentRecordFeed } from '../agent/record-feed.js';
import type { Managers } from '../managers.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { RemoteAcpHooks } from '../remote/acp-session.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import { acpLaunchForEntry } from '../acp/launch.js';
import { AgentRun } from '../agent/run.js';
import { deferred } from '../deferred.js';
import type { SubagentAttemptOptions } from './attempt.js';
import type { SubagentAttemptSessionOptions } from './attempt-session.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn(), createRemoteAcpSession: vi.fn(), runToolLoop: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../remote/acp-session.js', () => ({ createRemoteAcpSession: mocks.createRemoteAcpSession }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  return { ...actual, runToolLoop: mocks.runToolLoop };
});

const { openSubagentAttemptSession } = await import('./attempt-session.js');
const { runSubagentEntry } = await import('./attempt.js');

const ENTRY: RoleEntry = { harness: 'opencode', model: 'model-a' };
const SETTINGS: AcpRoleSettings = { name: 'Research', entries: [ENTRY], commands: ['file read'] };
const runs: AgentRun[] = [];

type ConnectOptions = {
  command: string; args: string[]; env: Record<string, string>; cwd: string; workspaceDir: string;
  offline?: boolean; autonomous?: true; allowedTools?: string[]; installedSkillDirs?: string[];
  effort?: unknown; sessionMeta?: Record<string, unknown>;
  onError: (message: string) => void; onSessionStarted?: (id: string) => void; onActivity?: (update: unknown) => void;
};

function openHelper(overrides: Partial<SubagentAttemptSessionOptions> = {}) {
  const calls = {
    onError: vi.fn(), onSessionStarted: vi.fn(), onActivity: vi.fn(),
    onRemoteActivity: vi.fn(), onTerminated: vi.fn(),
  };
  let disposeFn: () => Promise<void> = async () => {};
  const base: SubagentAttemptSessionOptions = {
    launch: acpLaunchForEntry(ENTRY)!, executionDir: '/clone', runId: 'run-1', offline: true,
    onDispose: (dispose) => { disposeFn = dispose; },
    ...calls,
    active: () => true,
  };
  const lease = openSubagentAttemptSession({ ...base, ...overrides });
  return { lease, calls, get dispose() { return disposeFn; } };
}

function localSession(shutdown: AcpSession['shutdown'] = vi.fn(async () => {})) {
  const session: AcpSession = {
    prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown,
  };
  mocks.connectAcp.mockReturnValue(session);
  return { session, shutdown };
}

type FakeRemote = {
  remote: true;
  ready: Promise<boolean>;
  release: () => Promise<boolean>;
  shutdown: () => Promise<void>;
  cancel: () => Promise<void>;
  kill: () => void;
  run: (text: string, snapshot: unknown, runCaller: unknown, events: AcpLoopHandlers) => void;
};

function remoteSession(overrides: { answer?: string; ready?: Promise<boolean>; release?: () => Promise<boolean> } = {}) {
  let hooks: RemoteAcpHooks | undefined;
  let captured: { text: string; snapshot: unknown; events: AcpLoopHandlers } | undefined;
  const session: FakeRemote = {
    remote: true,
    ready: overrides.ready ?? Promise.resolve(true),
    release: overrides.release ?? vi.fn(async () => true),
    shutdown: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    kill: vi.fn(),
    run: (text, snapshot, _runCaller, events) => {
      captured = { text, snapshot, events };
      if (overrides.answer !== undefined) {
        events.endTurn(overrides.answer);
        events.finished('answered', 8);
      }
    },
  };
  mocks.createRemoteAcpSession.mockImplementation((_channel: unknown, _options: unknown, value: RemoteAcpHooks) => {
    hooks = value;
    return session;
  });
  return { session, get hooks() { return hooks!; }, get captured() { return captured!; } };
}

function driverSetup(overrides: Partial<SubagentAttemptOptions> = {}) {
  const caller = { label: 'caller', incarnation: 'inc', cwd: '/caller', context: [] as string[] };
  const run = new AgentRun(caller, {
    taskPath: 'task.md', taskText: 'TASK', skills: [], grants: ['file read'],
  }, undefined, undefined, '/clone');
  runs.push(run);
  const record = { prompt: vi.fn(), activity: vi.fn(), finish: vi.fn() };
  run.record = record as unknown as AgentRecordFeed;
  const invocation: CommandInvocationContext = {
    runId: 'launch-run', invocationId: 'launch-inv', caller, signal: run.abortController.signal,
  };
  const managers = {
    command: { dispatchNativeLine: vi.fn(async () => ({ dispatched: true, output: '' })) },
  } as unknown as Managers;
  const channel = {} as RemoteChannel;
  const options: SubagentAttemptOptions = {
    run, invocation, managers, settings: SETTINGS, entry: ENTRY, executionDir: '/clone',
    nativeSettings: undefined, ...overrides,
  };
  return { run, record, options, channel, managers };
}

function startDriver(options: SubagentAttemptOptions) {
  const execution = runSubagentEntry(options);
  return { execution };
}

async function withRealLoop(fn: () => Promise<void>): Promise<void> {
  const actual = await vi.importActual<typeof DriveLoop>('../acp/drive-loop.js');
  await mocks.runToolLoop.withImplementation(actual.runToolLoop, fn);
}

function connectOptions(call = 0): ConnectOptions {
  return mocks.connectAcp.mock.calls[call][0] as ConnectOptions;
}

beforeEach(() => {
  mocks.connectAcp.mockReset();
  mocks.createRemoteAcpSession.mockReset();
  mocks.runToolLoop.mockReset();
  runs.length = 0;
});
afterEach(async () => {
  for (const run of runs) if (run.outcome === undefined) await run.finish('completed');
});

describe('openSubagentAttemptSession', () => {
  it.each([
    { harness: 'opencode', model: 'm', effort: 'medium' },
    { harness: 'opencode', model: 'm' },
    { harness: 'claude', model: 'm', effort: 'high' },
    { harness: 'claude', model: 'm' },
    { harness: 'codex', model: 'm', effort: 'high' },
    { harness: 'codex', model: 'm' },
  ])('forwards the full launch for %j unchanged', (entry) => {
    const launch = acpLaunchForEntry(entry)!;
    localSession();
    openHelper({ launch });
    expect(connectOptions()).toEqual({
      command: launch.command,
      args: launch.args,
      env: launch.env,
      ...(launch.sessionMeta !== undefined && { sessionMeta: launch.sessionMeta }),
      offline: true,
      cwd: '/clone',
      workspaceDir: '/clone',
      onError: expect.any(Function),
      onSessionStarted: expect.any(Function),
      onActivity: expect.any(Function),
    });
  });

  it('reports an unsupported harness exactly and opens no session', async () => {
    expect(acpLaunchForEntry({ harness: 'unsupported', model: 'm' })).toBeUndefined();
    const { options } = driverSetup({ entry: { harness: 'unsupported', model: 'm' } });
    expect(await runSubagentEntry(options)).toMatchObject({
      status: 'failed', response: 'no ACP adapter for harness "unsupported".', reason: 'error',
    });
    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(mocks.createRemoteAcpSession).not.toHaveBeenCalled();
  });

  it('confines to the clone offline without approval-enabling options and keeps denial env/meta', () => {
    const entry: RoleEntry = { harness: 'codex', model: 'm', effort: 'high' };
    const launch = acpLaunchForEntry(entry)!;
    localSession();
    openHelper({ launch });
    const options = connectOptions();
    expect(options.cwd).toBe('/clone');
    expect(options.workspaceDir).toBe('/clone');
    expect(options.offline).toBe(true);
    expect(options.autonomous).toBeUndefined();
    expect(options.allowedTools).toBeUndefined();
    expect(options.installedSkillDirs).toBeUndefined();
    expect(options.effort).toBeUndefined();
    expect(options.env).toEqual(launch.env);
    expect(options.env.CODEX_CONFIG).toContain('shell_tool');
    expect(options.sessionMeta).toEqual(launch.sessionMeta);
  });

  it('opens the selected remote clone with a unique address and runs before ready resolves', async () => {
    const pending = new Promise<boolean>(() => {});
    const remote = remoteSession({ ready: pending, answer: 'remote answer' });
    const { options, run } = driverSetup({ remote: { channel: {} as RemoteChannel, host: 'build-box', workspace: 'clone-label' } });
    await withRealLoop(async () => {
      const { execution } = startDriver(options);
      expect(mocks.createRemoteAcpSession).toHaveBeenCalledTimes(1);
      const [channel, open] = mocks.createRemoteAcpSession.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(channel).toBe(options.remote?.channel);
      expect(open).toMatchObject({ workspace: 'clone-label', command: 'opencode' });
      expect('offline' in open).toBe(false);
      expect(open.id).toMatch(/^subagent-[0-9a-f-]+$/);
      expect(open.id).toContain(run.id);
      expect(remote.captured.text).toContain('TASK');
      expect(await execution).toMatchObject({ status: 'completed', response: 'remote answer' });
    });
    const first = (mocks.createRemoteAcpSession.mock.calls[0][1] as { id: string }).id;
    openHelper({ remote: { channel: {} as RemoteChannel, host: 'build-box', workspace: 'clone-label' } });
    const second = (mocks.createRemoteAcpSession.mock.calls[1][1] as { id: string }).id;
    expect(second).not.toBe(first);
    expect(second).toMatch(/^subagent-run-1-/);
  });

  it('retains an early provider id through a later effort failure while ready is pending', () => {
    const pending = new Promise<boolean>(() => {});
    remoteSession({ ready: pending });
    const { calls } = openHelper({ remote: { channel: {} as RemoteChannel, host: 'box', workspace: 'w' } });
    const hooks = mocks.createRemoteAcpSession.mock.calls[0][2] as RemoteAcpHooks;
    hooks.onSessionStarted?.('provider-77');
    hooks.onError?.('effort rejected', false);
    expect(calls.onSessionStarted).toHaveBeenCalledWith('provider-77');
    expect(calls.onError).toHaveBeenCalledWith('effort rejected');
    expect(calls.onSessionStarted).toHaveBeenCalledTimes(1);
  });

  it('maps a ready rejection before an id to a failed result with its source text', async () => {
    const ready = Promise.reject(new Error('readiness denied'));
    void ready.catch(() => {});
    remoteSession({ ready });
    const { options } = driverSetup({ remote: { channel: {} as RemoteChannel, host: 'box', workspace: 'w' } });
    const { execution } = startDriver(options);
    const remoteHooks = mocks.createRemoteAcpSession.mock.calls[0][2] as RemoteAcpHooks;
    remoteHooks.onError?.('readiness denied', true);
    expect(await execution).toMatchObject({
      status: 'failed', response: 'readiness denied', replied: false, sessionId: null, reason: 'error',
    });
  });

  it('adopts before replaying an id then an error fired synchronously by the constructor', () => {
    const adopted: string[] = [];
    mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
      options.onSessionStarted?.('provider-sync');
      options.onError('effort sync');
      return { prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(async () => {}) };
    });
    const { calls } = openHelper({ adoptSession: () => { adopted.push('adopt'); } });
    expect(calls.onSessionStarted).toHaveBeenCalledWith('provider-sync');
    expect(calls.onError).toHaveBeenCalledWith('effort sync');
    expect(adopted).toEqual(['adopt']);
  });

  it('suppresses an id and activity that follow an earlier synchronous failure', () => {
    localSession();
    let live = true;
    const onError = vi.fn(() => { live = false; });
    mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
      options.onError('first failure');
      options.onSessionStarted?.('too-late');
      options.onActivity?.({ sessionUpdate: 'agent_message_chunk', content: 'late' });
      return { prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(async () => {}) };
    });
    const { calls } = openHelper({ active: () => live, onError });
    expect(onError).toHaveBeenCalledWith('first failure');
    expect(calls.onSessionStarted).not.toHaveBeenCalled();
    expect(calls.onRemoteActivity).not.toHaveBeenCalled();
    expect(calls.onActivity).not.toHaveBeenCalled();
  });

  it('replays id-only observations when the constructor throws and reports the throw', () => {
    const calls = {
      onError: vi.fn(), onSessionStarted: vi.fn(), onActivity: vi.fn(),
      onRemoteActivity: vi.fn(), onTerminated: vi.fn(),
    };
    mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
      options.onSessionStarted?.('provider-before-throw');
      throw new Error('constructor boom');
    });
    expect(() => openHelper(calls)).toThrow('constructor boom');
    expect(calls.onSessionStarted).toHaveBeenCalledWith('provider-before-throw');
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it('classifies a thrown constructor after an id through the driver while keeping the id', async () => {
    const provider = vi.fn();
    mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
      options.onSessionStarted?.('provider-earlier');
      throw new Error('constructor after id');
    });
    const { options } = driverSetup();
    expect(await runSubagentEntry({ ...options, onSessionStarted: provider })).toMatchObject({
      status: 'failed', response: 'constructor after id', sessionId: 'provider-earlier',
    });
    expect(provider).toHaveBeenCalledWith('provider-earlier');
  });

  it('closes the returned handle when adoption throws', async () => {
    const shutdown = vi.fn(async () => {});
    localSession(shutdown);
    expect(() => openHelper({
      adoptSession: () => { throw new Error('adoption boom'); },
    })).toThrow('adoption boom');
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledTimes(1));
  });

  it('returns terminated without a connection for an ended run or a refused allocation', async () => {
    const ended = driverSetup();
    await ended.run.finish('completed');
    expect(await runSubagentEntry(ended.options)).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', reason: 'terminated',
    });
    const refused = driverSetup();
    vi.spyOn(refused.run, 'beginAllocation').mockReturnValue(undefined);
    expect(await runSubagentEntry(refused.options)).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', reason: 'terminated',
    });
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });

  it('closes a late-returned handle when abort happens during construction', async () => {
    const { run, options } = driverSetup();
    const shutdown = vi.fn(async () => {});
    mocks.connectAcp.mockImplementation(() => {
      run.abortController.abort();
      return { prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown };
    });
    const { execution } = startDriver(options);
    expect(await execution).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', replied: false, reason: 'terminated',
    });
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('blocks later prompts after an abort during an active turn', async () => {
    const { session } = localSession();
    const { run, options } = driverSetup();
    const { execution } = startDriver(options);
    const call = mocks.runToolLoop.mock.calls[0];
    const loopSession = call[0] as { prompt: (text: string, handlers: AcpPromptHandlers) => void };
    run.abortController.abort();
    loopSession.prompt('late', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    expect(session.prompt).not.toHaveBeenCalled();
    expect(await execution).toMatchObject({ status: 'terminated', reason: 'terminated' });
  });

  it('preserves output and records cleanup warnings from release and shutdown failures', async () => {
    const release = vi.fn(async () => false);
    remoteSession({ release, answer: 'kept answer' });
    const remoteRun = driverSetup({ remote: { channel: {} as RemoteChannel, host: 'box', workspace: 'w' } });
    await withRealLoop(async () => {
      const remoteResult = await runSubagentEntry(remoteRun.options);
      expect(remoteResult).toMatchObject({ status: 'completed', response: 'kept answer' });
      expect(remoteResult.cleanupWarnings).toEqual(['Remote agent close was not acknowledged.']);
    });

    const shutdown = vi.fn(async () => { throw new Error('shutdown boom'); });
    localSession(shutdown);
    const local = driverSetup();
    const { execution } = startDriver(local.options);
    const events = mocks.runToolLoop.mock.calls.at(-1)![4] as AcpLoopHandlers;
    events.endTurn('local answer');
    events.finished('answered', 8);
    const localResult = await execution;
    expect(localResult).toMatchObject({ status: 'completed', response: 'local answer' });
    expect(localResult.cleanupWarnings).toEqual(['shutdown boom']);
  });

  it('closes once across overlapping dispose, finally and termination while cleanup awaits allocation', async () => {
    const gate = deferred<void>();
    const shutdown = vi.fn(() => gate.promise);
    localSession(shutdown);
    const { run, options } = driverSetup();
    const { execution } = startDriver({ ...options, adoptSession: (lease) => { void lease.dispose(); } });
    const events = mocks.runToolLoop.mock.calls.at(-1)![4] as AcpLoopHandlers;
    events.endTurn('answer');
    events.finished('answered', 8);
    let settled = false;
    let cleaned = false;
    const tracked = (async () => { await execution; settled = true; })();
    const cleanup = (async () => { await run.finish('completed'); cleaned = true; })();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(cleaned).toBe(false);
    gate.resolve();
    await tracked;
    await cleanup;
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('supports standalone use without adoption, detaches listeners and ignores callbacks after disposal', async () => {
    const { session, shutdown } = localSession();
    const { lease, calls, dispose } = openHelper();
    expect(lease.session).toBe(session);
    const connect = connectOptions();
    await dispose();
    expect(shutdown).toHaveBeenCalledTimes(1);
    connect.onError?.('stale');
    connect.onSessionStarted?.('stale');
    connect.onActivity?.({ sessionUpdate: 'agent_message_chunk', content: 'stale' });
    expect(calls.onError).not.toHaveBeenCalled();
    expect(calls.onSessionStarted).not.toHaveBeenCalled();
    expect(calls.onActivity).not.toHaveBeenCalled();

    const { run, options } = driverSetup();
    const remove = vi.spyOn(run.abortController.signal, 'removeEventListener');
    const { execution } = startDriver(options);
    const events = mocks.runToolLoop.mock.calls.at(-1)![4] as AcpLoopHandlers;
    events.endTurn('done');
    events.finished('answered', 8);
    await execution;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
