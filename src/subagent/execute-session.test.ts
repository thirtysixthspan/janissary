import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attempt from './attempt.js';
import type * as DriveLoop from '../acp/drive-loop.js';
import type { AcpLoopHandlers, AcpSession } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AgentRecordFeed } from '../agent/record-feed.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { SubagentAttemptLease } from './attempt-session.js';
import { AgentRun } from '../agent/run.js';
import type { SubagentExecutionOptions } from './execute.js';

const mocks = vi.hoisted(() => ({
  runSubagentEntry: vi.fn(),
  real: undefined as unknown,
  connectAcp: vi.fn(),
  createRemoteAcpSession: vi.fn(),
  runToolLoop: vi.fn(),
}));

vi.mock('./attempt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Attempt>();
  mocks.real = actual.runSubagentEntry;
  return { ...actual, runSubagentEntry: (options: Attempt.SubagentAttemptOptions) => mocks.runSubagentEntry(options) };
});
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../remote/acp-session.js', () => ({ createRemoteAcpSession: mocks.createRemoteAcpSession }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  return { ...actual, runToolLoop: mocks.runToolLoop };
});

const { executeSubagentRun } = await import('./execute.js');
const { createSubagentSessionSlot } = await import('./execute-session.js');

type AttemptResult = Attempt.SubagentAttemptResult;
type AttemptOptions = Attempt.SubagentAttemptOptions;

const A: RoleEntry = { harness: 'opencode', model: 'a' };
const B: RoleEntry = { harness: 'claude', model: 'b' };
const ENTRIES = [A, B] as const;
const runs: AgentRun[] = [];

function nativeSettings(): CommandSettingsSnapshot {
  return {
    commands: [{ name: 'file read', effectiveEnabled: true, effectiveAgentAccess: true }],
    source: 'default', path: '',
  } as CommandSettingsSnapshot;
}

function result(overrides: Partial<AttemptResult> = {}): AttemptResult {
  return {
    status: 'failed', response: 'boom', replied: false, reason: 'error', sessionId: null,
    cleanupWarnings: [], ...overrides,
  };
}

function handshake(id: string, outcome: AttemptResult) {
  return (options: AttemptOptions) => {
    options.onSessionStarted?.(id);
    return Promise.resolve(outcome);
  };
}

function script(...steps: Array<AttemptResult | ((options: AttemptOptions) => Promise<AttemptResult> | AttemptResult)>) {
  mocks.runSubagentEntry.mockReset();
  const queue = [...steps];
  mocks.runSubagentEntry.mockImplementation((options: AttemptOptions) => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra attempt');
    if (typeof next === 'function') return next(options);
    return Promise.resolve(next);
  });
}

function useRealDriver(): void {
  mocks.runSubagentEntry.mockReset();
  mocks.runSubagentEntry.mockImplementation((options: AttemptOptions) => (mocks.real as typeof Attempt.runSubagentEntry)(options));
}

function controlledLease() {
  const gate = Promise.withResolvers<void>();
  const physical = vi.fn();
  let closed: Promise<void> | undefined;
  const dispose = vi.fn(() => {
    closed ??= (async () => { physical(); await gate.promise; })();
    return closed;
  });
  const lease: SubagentAttemptLease = { session: {} as AcpSession, dispose };
  return { lease, dispose, physical, resolve: () => gate.resolve() };
}

function setup(overrides: Partial<SubagentExecutionOptions> = {}) {
  const caller = { label: 'caller', incarnation: 'inc', cwd: '/caller', context: [] };
  const run = new AgentRun(caller, {
    taskPath: 'task.md', taskText: 'TASK', skills: [], grants: ['file read'],
  }, undefined, undefined, '/clone');
  runs.push(run);
  const record = { prompt: vi.fn(), activity: vi.fn(), finish: vi.fn() };
  run.record = record as unknown as AgentRecordFeed;
  const invocation: CommandInvocationContext = {
    runId: 'launch-run', invocationId: 'launch-inv', caller, signal: run.abortController.signal,
  };
  const current = vi.fn(() => nativeSettings());
  const managers = {
    nativeCommandSettings: { current },
    command: { dispatchNativeLine: vi.fn(async () => ({ dispatched: true, output: '' })) },
  } as unknown as Managers;
  const settings: AcpRoleSettings = { name: 'Research', entries: [{ ...A }, { ...B }], commands: ['file read'] };
  const options: SubagentExecutionOptions = {
    run, invocation, managers, settings, entries: ENTRIES, executionDir: '/clone', ...overrides,
  };
  return { run, record, invocation, current, settings, options };
}

function localSession(shutdown: AcpSession['shutdown'] = vi.fn(async () => {})): AcpSession {
  const session: AcpSession = {
    prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown,
  };
  mocks.connectAcp.mockReturnValue(session);
  return session;
}

beforeEach(() => {
  mocks.connectAcp.mockReset();
  mocks.createRemoteAcpSession.mockReset();
  mocks.runToolLoop.mockReset();
  mocks.runToolLoop.mockImplementation(() => {});
  runs.length = 0;
  useRealDriver();
});

afterEach(async () => {
  for (const run of runs) if (run.outcome === undefined) await run.finish('completed');
});

describe('subagent session slot', () => {
  it.each(['ended', 'aborted'])('leaves an already-%s run with no driver, resource or session', async (mode) => {
    const { run, options } = setup();
    script(result());
    if (mode === 'ended') await run.finish('completed');
    else run.abortController.abort();
    expect(await executeSubagentRun(options)).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', sessionId: null, cleanupWarnings: [],
    });
    expect(mocks.runSubagentEntry).not.toHaveBeenCalled();
    expect([...run.childIds]).toEqual([]);
  });

  it('registers exactly one resource before an all-unsupported driver is constructed', async () => {
    const { run, options } = setup({ entries: [{ harness: 'unsupported', model: 'm' }] });
    useRealDriver();
    mocks.runSubagentEntry.mockImplementationOnce((driver: AttemptOptions) => {
      expect(driver.run.childIds.has(`acp:${driver.run.id}`)).toBe(true);
      return (mocks.real as typeof Attempt.runSubagentEntry)(driver);
    });
    expect(await executeSubagentRun(options)).toMatchObject({
      status: 'failed', response: 'no ACP adapter for harness "unsupported".',
    });
    expect([...run.childIds].filter((id) => id.startsWith('acp:'))).toHaveLength(1);
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });

  it('waits for a deferred prior dispose and holds the slot until the result resolves', async () => {
    const { run, options } = setup();
    const first = controlledLease();
    let secondCalled = false;
    mocks.runSubagentEntry.mockReset()
      .mockImplementationOnce(async (driver: AttemptOptions) => {
        driver.adoptSession?.(first.lease);
        await first.lease.dispose();
        return result();
      })
      .mockImplementationOnce(async () => {
        secondCalled = true;
        return result({ status: 'completed', response: 'ok' });
      });
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce());
    expect(secondCalled).toBe(false);
    expect([...run.childIds]).toContain(`acp:${run.id}`);
    first.resolve();
    expect(await execution).toMatchObject({ status: 'completed', response: 'ok' });
    expect(secondCalled).toBe(true);
  });

  it('stops fallback when the run terminates during the deferred disposal', async () => {
    const { run, options } = setup();
    const first = controlledLease();
    const report = vi.spyOn(run, 'reportActivity');
    let secondCalled = false;
    mocks.runSubagentEntry.mockReset()
      .mockImplementationOnce(async (driver: AttemptOptions) => {
        driver.adoptSession?.(first.lease);
        await first.lease.dispose();
        return result();
      })
      .mockImplementationOnce(async () => {
        secondCalled = true;
        return result({ status: 'completed', response: 'late' });
      });
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce());
    const finishing = run.finish('terminated');
    first.resolve();
    expect(await execution).toMatchObject({ status: 'terminated', response: 'Subagent terminated.' });
    await finishing;
    expect(secondCalled).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });

  it('opens no replacement and writes no notice when aborted between a result and admission', async () => {
    const { run, options } = setup();
    const report = vi.spyOn(run, 'reportActivity');
    mocks.runSubagentEntry.mockReset().mockImplementationOnce(() => new Promise<AttemptResult>((resolve) => {
      queueMicrotask(() => { run.abortController.abort(); resolve(result()); });
    }));
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'terminated' });
    expect(mocks.runSubagentEntry).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it('disposes a lease adopted in the empty-slot gap and keeps the slot closed after clearAfterResult', async () => {
    const { run } = setup();
    const slot = createSubagentSessionSlot(run);
    await run.finish('completed');
    expect(slot.closed).toBe(true);
    const late = controlledLease();
    slot.adoptSession(late.lease);
    expect(late.dispose).toHaveBeenCalledOnce();
    slot.clearAfterResult();
    expect(slot.closed).toBe(true);
  });

  it('closes a late-returned handle through plan 17 and waits for its allocation before clone release', async () => {
    const { run, options } = setup();
    useRealDriver();
    const gate = Promise.withResolvers<void>();
    const late = localSession(vi.fn(() => gate.promise));
    mocks.connectAcp.mockImplementation(() => { run.abortController.abort(); return late; });
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(late.shutdown).toHaveBeenCalledOnce());
    const finishing = run.finish('terminated');
    let finished = false;
    void finishing.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    gate.resolve();
    expect(await execution).toMatchObject({ status: 'terminated', response: 'Subagent terminated.' });
    await finishing;
    expect(late.shutdown).toHaveBeenCalledOnce();
  });

  it('closes a local session exactly once across run cleanup, driver finally and repeated disposal', async () => {
    const { run, options } = setup();
    useRealDriver();
    const session = localSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    const finishing = run.finish('terminated');
    expect(await execution).toMatchObject({ status: 'terminated' });
    await finishing;
    expect(session.shutdown).toHaveBeenCalledOnce();
  });

  it('releases a remote session exactly once across the same overlap', async () => {
    const release = vi.fn(async () => true);
    const { run, options } = setup({ remote: { channel: {} as RemoteChannel, host: 'build-box', workspace: 'clone-9' } });
    useRealDriver();
    mocks.createRemoteAcpSession.mockReturnValue({
      remote: true, ready: Promise.resolve(true), release,
      shutdown: vi.fn(async () => {}), cancel: vi.fn(async () => {}), kill: vi.fn(), run: vi.fn(),
    });
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    const finishing = run.finish('terminated');
    expect(await execution).toMatchObject({ status: 'terminated' });
    await finishing;
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps one local shutdown warning without repeating it at settlement', async () => {
    const { run, options } = setup();
    useRealDriver();
    const session = localSession(vi.fn(async () => { throw new Error('close boom'); }));
    mocks.runToolLoop.mockImplementation((_session, _prompt, _snapshot, _host, events: AcpLoopHandlers) => {
      events.endTurn('selected');
      events.finished('answered', 8);
    });
    const outcome = await executeSubagentRun(options);
    expect(outcome).toMatchObject({ status: 'completed', response: 'selected' });
    expect(outcome.cleanupWarnings).toEqual(['close boom']);
    await run.finish('completed');
    expect(outcome.cleanupWarnings).toEqual(['close boom']);
    expect(session.shutdown).toHaveBeenCalledOnce();
  });

  it('keeps one remote release warning without repeating it at settlement', async () => {
    const { run, options } = setup({ remote: { channel: {} as RemoteChannel, host: 'build-box', workspace: 'clone-9' } });
    useRealDriver();
    mocks.createRemoteAcpSession.mockReturnValue({
      remote: true, ready: Promise.resolve(true), release: vi.fn(async () => false),
      shutdown: vi.fn(async () => {}), cancel: vi.fn(async () => {}), kill: vi.fn(), run: vi.fn(),
    });
    mocks.runToolLoop.mockImplementation((_session, _prompt, _snapshot, _host, events: AcpLoopHandlers) => {
      events.endTurn('remote selected');
      events.finished('answered', 8);
    });
    const outcome = await executeSubagentRun(options);
    expect(outcome).toMatchObject({ status: 'completed', response: 'remote selected' });
    expect(outcome.cleanupWarnings).toEqual(['Remote agent close was not acknowledged.']);
    await run.finish('completed');
    expect(outcome.cleanupWarnings).toEqual(['Remote agent close was not acknowledged.']);
  });

  it('does not physically close twice after a cleared slot and a later settlement', async () => {
    const { run, options } = setup();
    useRealDriver();
    const session = localSession();
    mocks.runToolLoop.mockImplementation((_session, _prompt, _snapshot, _host, events: AcpLoopHandlers) => {
      events.endTurn('answer');
      events.finished('answered', 8);
    });
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'completed', response: 'answer' });
    expect(session.shutdown).toHaveBeenCalledOnce();
    await run.finish('completed');
    expect(session.shutdown).toHaveBeenCalledOnce();
  });

  it('returns a terminated result with warnings and the latest id without trying the next entry', async () => {
    const { options } = setup();
    let secondCalled = false;
    script(handshake('A', result({
      status: 'terminated', response: 'driver stopped', cleanupWarnings: ['warn'],
    })), () => { secondCalled = true; return Promise.resolve(result({ status: 'completed', response: 'later' })); });
    const outcome = await executeSubagentRun(options);
    expect(outcome).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', sessionId: 'A', cleanupWarnings: ['warn'],
    });
    expect(secondCalled).toBe(false);
    expect(mocks.runSubagentEntry).toHaveBeenCalledTimes(1);
  });

  it('disposes a replacement once when a notice subscriber ends the run after admission', async () => {
    const { run, options } = setup();
    const lease = controlledLease();
    let third = false;
    let ended = false;
    run.subscribe(() => {
      if (ended || run.view().activity.length === 0) return;
      ended = true;
      void run.finish('terminated');
      lease.resolve();
    });
    script(result(), async (driver: AttemptOptions) => {
      driver.adoptSession?.(lease.lease);
      await lease.lease.dispose();
      return result();
    }, () => { third = true; return Promise.resolve(result({ status: 'completed', response: 'third' })); });
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'terminated' });
    expect(lease.physical).toHaveBeenCalledOnce();
    expect(third).toBe(false);
    await Promise.resolve();
  });

  it('returns with no resource or session when the run terminates during native-settings capture', async () => {
    const { run, options, current } = setup();
    current.mockImplementation(() => { run.abortController.abort(); return nativeSettings(); });
    expect(await executeSubagentRun(options)).toMatchObject({
      status: 'terminated', response: 'Subagent terminated.', sessionId: null, cleanupWarnings: [],
    });
    expect(mocks.runSubagentEntry).not.toHaveBeenCalled();
    expect([...run.childIds]).toEqual([]);
  });
});
