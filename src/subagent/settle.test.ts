import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { AgentRun } from '../agent/run.js';
import { settleSubagentRun, type SubagentSettlementResult } from './settle.js';
import { executeSubagentRun, type SubagentExecutionOptions } from './execute.js';
import type { SubagentReplySink } from './replies.js';
import { deferred } from '../deferred.js';
import { fallbackNotice } from '../acp/ask-role.js';
import type { AcpLoopHandlers, AcpSession } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type * as AcpModule from '../acp/index.js';
import type * as DriveLoopModule from '../acp/drive-loop.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn(), runToolLoop: vi.fn() }));
vi.mock('../acp/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AcpModule>();
  return { ...actual, connectAcp: mocks.connectAcp };
});
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoopModule>();
  return { ...actual, runToolLoop: mocks.runToolLoop };
});

const snapshot: AgentSnapshot = Object.freeze({ taskPath: 'task.md', taskText: '', skills: [], grants: [] });
const project = createControllerTestProject();

let controller: ReturnType<typeof project.create>;
let run: AgentRun;
let sink: SubagentReplySink;
let completion: ReturnType<typeof vi.fn>;
let reached: boolean;
let firstId: string | null;

beforeEach(() => {
  controller = project.create();
  const caller = seedRootTab(controller.managers.tab);
  const captured = controller.managers.agent.captureCaller(caller);
  run = controller.managers.agent.create({ caller: captured, snapshot });
  completion = vi.fn();
  sink = { started: vi.fn(), completion };
  reached = false;
  firstId = 'provider-1';
  mocks.connectAcp.mockReset();
  mocks.runToolLoop.mockReset();
  mocks.runToolLoop.mockImplementation(() => {});
});

afterEach(async () => { await project.dispose(); vi.restoreAllMocks(); });

async function flush(times = 12) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function settle(execute: () => Promise<never | Awaited<ReturnType<typeof success>>>): Promise<SubagentSettlementResult> {
  return settleSubagentRun({
    run, managers: controller.managers, sink, firstProviderId: () => firstId,
    executionReached: () => reached, execute: execute as never,
  });
}

function success(overrides: Partial<Awaited<ReturnType<typeof success>>> = {}) {
  return Promise.resolve({
    status: 'completed' as const, response: 'answer', sessionId: 'session-1', cleanupWarnings: [] as string[],
    ...overrides,
  });
}

const FIRST = { harness: 'opencode' as const, model: 'model-a' };
const REPLACEMENT = { harness: 'claude' as const, model: 'model-b' };

function localSession(shutdown: () => Promise<void>): AcpSession {
  return { prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(shutdown) };
}

function loopHandlers(call: number): AcpLoopHandlers {
  return mocks.runToolLoop.mock.calls[call]![4] as AcpLoopHandlers;
}

function connectHooks(call: number): { onSessionStarted?: (id: string) => void; onError: (message: string) => void } {
  return mocks.connectAcp.mock.calls[call]![0] as {
    onSessionStarted?: (id: string) => void; onError: (message: string) => void;
  };
}

function realOptions(target: AgentRun, onStarted?: (id: string) => void): SubagentExecutionOptions {
  const invocation: CommandInvocationContext = {
    runId: 'rejection-run', invocationId: 'rejection-inv',
    caller: { label: 'caller', cwd: '/caller', context: [] },
    signal: target.abortController.signal,
  };
  return {
    run: target, invocation, managers: controller.managers,
    settings: {
      name: 'Research', commands: ['file read'],
      entries: [FIRST, REPLACEMENT].map((entry) => ({ ...entry })),
    },
    entries: [FIRST, REPLACEMENT], executionDir: '/clone', onStarted,
  };
}

describe('settleSubagentRun', () => {
  it('preserves a completed result and aggregates warnings without changing output or status', async () => {
    const result = await settle(() => success({ cleanupWarnings: ['warning one', 'warning two'] }));
    expect(result).toMatchObject({
      status: 'completed', response: 'answer', sessionId: 'session-1',
      cleanupWarnings: ['warning one', 'warning two'],
    });
    expect(completion).toHaveBeenCalledWith('completed', 'answer', 'session-1');
    expect(result.response).not.toContain('warning');
  });

  it('preserves a partial outcome verbatim', async () => {
    const result = await settle(() => success({ status: 'partial', response: '## partial' }));
    expect(result.status).toBe('partial');
    expect(result.response).toBe('## partial');
    expect(completion).toHaveBeenCalledWith('partial', '## partial', 'session-1');
  });

  it('keeps empty, whitespace and multiline failed responses unchanged', async () => {
    for (const response of ['', '   \n\t', 'line one\nline two\n\nthird']) {
      const result = await settle(() => success({ status: 'failed', response }));
      expect(result.response).toBe(response);
      expect(result.status).toBe('failed');
    }
  });

  it('uses errorText unchanged for a thrown provisioning or resolution failure without a cleanup abort', async () => {
    reached = false;
    const result = await settle(() => Promise.reject(new Error('Agent: unknown task "t".')));
    expect(result).toMatchObject({
      status: 'failed', response: 'Agent: unknown task "t".', sessionId: firstId, cleanupWarnings: [],
    });
    expect(run.abortController.signal.aborted).toBe(false);
    expect(completion).toHaveBeenCalledWith('failed', 'Agent: unknown task "t".', firstId);
  });

  it('aborts the owned run before failed settlement on an unexpected executor throw only', async () => {
    reached = true;
    let abortedAtCleanup: boolean | undefined;
    run.addResource('driver-disposal', () => { abortedAtCleanup = run.abortController.signal.aborted; });
    const error = new Error('fallback subscriber\nsecond line');
    const result = await settle(() => Promise.reject(error));

    expect(abortedAtCleanup).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.response).toBe('fallback subscriber\nsecond line');
    expect(result.sessionId).toBe(firstId);
    expect(completion).toHaveBeenCalledOnce();
  });

  it('does not introduce a cleanup abort for a normal returned failed result', async () => {
    reached = true;
    const result = await settle(() => success({ status: 'failed', response: 'failed normally' }));
    expect(run.abortController.signal.aborted).toBe(false);
    expect(result.response).toBe('failed normally');
  });

  it('lets a recorded termination override success while retaining the provider id', async () => {
    await run.finish('terminated');
    const result = await settle(() => success({ response: 'should be hidden' }));
    expect(result.status).toBe('terminated');
    expect(result.response).toBe('Subagent terminated.');
    expect(result.sessionId).toBe('session-1');
    expect(completion).toHaveBeenCalledWith('terminated', 'Subagent terminated.', 'session-1');
  });

  it('honours a termination raised while publishing Cleaning up', async () => {
    const unsubscribe = run.subscribe((view) => {
      if (view.status === 'Cleaning up') void controller.managers.agent.finish(run.id, 'terminated').catch(() => {});
    });
    const result = await settle(() => success());
    unsubscribe();
    expect(result.status).toBe('terminated');
    expect(result.response).toBe('Subagent terminated.');
  });

  it('settles a run another owner already removed without rejecting', async () => {
    controller.managers.agent.runs.delete(run.id);
    const result = await settle(() => success({ status: 'partial', response: 'kept' }));
    expect(result.status).toBe('partial');
    expect(run.outcome).toBe('partial');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('keeps completion pending until an active allocation and deferred disposal drain', async () => {
    reached = true;
    const allocation = run.beginAllocation()!;
    const disposal = deferred<void>();
    run.addResource('deferred-driver', () => disposal.promise);
    let abortedAtCleanup: boolean | undefined;
    run.addResource('observed-abort', () => { abortedAtCleanup = run.abortController.signal.aborted; });

    const pending = settle(() => Promise.reject(new Error('driver failed while active')));
    await flush();
    expect(completion).not.toHaveBeenCalled();
    expect(abortedAtCleanup).toBeUndefined();

    allocation();
    disposal.resolve();
    const result = await pending;
    expect(abortedAtCleanup).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.response).toBe('driver failed while active');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('delivers once when an external finish and late terminal callbacks race', async () => {
    let delivered = false;
    const once: SubagentReplySink = {
      started: vi.fn(),
      completion: (...args) => { if (delivered) return; delivered = true; completion(...args); },
    };
    const external = controller.managers.agent.finish(run.id, 'terminated');
    const result = await settleSubagentRun({
      run, managers: controller.managers, sink: once, firstProviderId: () => firstId,
      executionReached: () => false, execute: () => success(),
    });
    await external;
    once.completion('completed', 'late', 'session-1');
    expect(result.status).toBe('terminated');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('aborts and drains the real admitted replacement before failed settlement', async () => {
    const rejection = 'fallback subscriber threw\n  while the replacement was active\nafter allocation';
    const release = deferred<void>();
    const shutdownOrder: string[] = [];
    mocks.connectAcp.mockImplementationOnce(() => localSession(async () => { shutdownOrder.push('first'); }));
    mocks.connectAcp.mockImplementationOnce(() => localSession(async () => {
      shutdownOrder.push('replacement');
      await release.promise;
      shutdownOrder.push('replacement released');
    }));

    let abortedAtCleanup: boolean | undefined;
    run.addResource('observed-abort', () => { abortedAtCleanup = run.abortController.signal.aborted; });
    const notice = fallbackNotice(FIRST, REPLACEMENT);
    const seen: string[] = [];
    const unsubscribe = run.subscribe((view) => {
      if (view.activity.at(-1)?.text !== notice) return;
      unsubscribe();
      seen.push('notice');
      throw new Error(rejection);
    });
    reached = true;
    const pending = settle(() => executeSubagentRun(realOptions(run, (id) => { firstId = id; })));

    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    connectHooks(0).onSessionStarted?.('provider-A');
    loopHandlers(0).error('first attempt failed');
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(2));
    await flush(20);

    expect(seen).toEqual(['notice']);
    expect(run.abortController.signal.aborted).toBe(true);
    expect(completion).not.toHaveBeenCalled();
    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    expect(mocks.connectAcp.mock.calls[1]![0]).toMatchObject({ cwd: '/clone' });
    expect((mocks.connectAcp.mock.results[1]!.value as AcpSession).shutdown).toHaveBeenCalledOnce();

    release.resolve();
    const result = await pending;
    unsubscribe();

    expect(abortedAtCleanup).toBe(true);
    expect(shutdownOrder).toEqual(['first', 'replacement', 'replacement released']);
    expect((mocks.connectAcp.mock.results[1]!.value as AcpSession).shutdown).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'failed', response: rejection, sessionId: 'provider-A' });
    expect(completion).toHaveBeenCalledOnce();
    expect(completion).toHaveBeenCalledWith('failed', rejection, 'provider-A');

    loopHandlers(1).endTurn('late answer');
    loopHandlers(1).finished('answered');
    connectHooks(1).onError('late error');
    expect(completion).toHaveBeenCalledOnce();
  });

  it('introduces no cleanup abort for a normal returned failure from the real driver', async () => {
    const extra = controller.managers.agent.create({ caller: run.caller, snapshot });
    mocks.connectAcp.mockImplementation(() => localSession(async () => {}));
    const options = realOptions(extra);
    const pending = settleSubagentRun({
      run: extra, managers: controller.managers, sink: { started: vi.fn(), completion: vi.fn() },
      firstProviderId: () => null, executionReached: () => true,
      execute: () => executeSubagentRun({ ...options, entries: [FIRST] }),
    });
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledOnce());
    loopHandlers(0).error('normal failure');

    const result = await pending;
    expect(result).toMatchObject({ status: 'failed', response: 'normal failure' });
    expect(extra.abortController.signal.aborted).toBe(false);
  });
});
