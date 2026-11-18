import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { AgentRun } from '../agent/run.js';
import { settleSubagentRun, type SubagentSettlementResult } from './settle.js';
import type { SubagentReplySink } from './replies.js';
import { deferred } from '../deferred.js';

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
});
