import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { tabRuntime } from '../tab/runtime.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { AgentAcpCaller } from '../agent/run.js';
import { acpRoleRuntime } from '../acp/role-state.js';
import { closeSubagentSession } from '../acp/subagent-delivery.js';
import { createSubagentReplySink } from './replies.js';
import type { SubagentDelivery } from './messages.js';

const snapshot: AgentSnapshot = Object.freeze({ taskPath: 'task.md', taskText: '', skills: [], grants: [] });
const project = createControllerTestProject();
const acpCaller: AgentAcpCaller = { role: 'ask', sessionIdentity: 'internal-1', callerId: 'provider-1' };

let controller: ReturnType<typeof project.create>;
let caller: ReturnType<typeof seedRootTab>;
let sinkContext: Parameters<typeof createSubagentReplySink>[0];
let deliver: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  controller = project.create();
  caller = seedRootTab(controller.managers.tab);
  const captured = controller.managers.agent.captureCaller(caller);
  const run = controller.managers.agent.create({ caller: captured, snapshot });
  sinkContext = {
    managers: controller.managers, run,
    receipt: { replyId: 'reply-1', kind: 'record', recordId: run.recordId!, name: 'subagent:Research' },
    input: 'subagent --task task.md', label: caller.label,
    runtime: tabRuntime(caller), incarnation: captured.incarnation, role: 'Research',
  };
  deliver = vi.spyOn(controller.managers.acp, 'deliver').mockImplementation(() => {});
});

afterEach(async () => { await project.dispose(); vi.restoreAllMocks(); });

function humanSink() { return createSubagentReplySink(sinkContext); }

function acpSink() { return createSubagentReplySink({ ...sinkContext, acpCaller }); }

function deliveries(): SubagentDelivery[] {
  return deliver.mock.calls.map((call) => call[2] as SubagentDelivery);
}

describe('createSubagentReplySink — human replies', () => {
  it('appends the exact started wording with a fresh id and no record', () => {
    const sink = humanSink();
    sink.started('session-9');
    const entries = caller.log ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      input: 'subagent --task task.md', output: 'Subagent Research started.',
    });
    expect(entries[0].background).toEqual(expect.any(String));
    expect(entries[0].background).not.toBe('reply-1');
    expect(entries[0]).not.toHaveProperty('backgroundRecord');
  });

  it('appends the completion with the receipt id and record, using the original line', () => {
    const sink = humanSink();
    sink.completion('completed', 'final answer', 'session-9');
    expect(caller.log?.[0]).toMatchObject({
      input: 'subagent --task task.md',
      output: 'Subagent Research completed.\n\nfinal answer',
      background: 'reply-1',
      backgroundRecord: { id: sinkContext.receipt.recordId, name: 'subagent:Research' },
    });
  });

  it('latches started and completion so late callbacks publish once', () => {
    const sink = humanSink();
    sink.started('a');
    sink.started('b');
    sink.completion('completed', 'one', 'a');
    sink.completion('failed', 'two', 'b');
    expect(caller.log).toHaveLength(2);
    expect(caller.log?.[1].output).toContain('one');
  });

  it('does not start a run that already ended', () => {
    const sink = humanSink();
    void sinkContext.run.finish('terminated');
    sink.started('a');
    expect(caller.log ?? []).toHaveLength(0);
  });

  it('suppresses replies to a closing, closed, or reincarnated tab', () => {
    const sink = humanSink();
    tabRuntime(caller).closing = true;
    sink.started('a');
    sink.completion('completed', 'x', 'a');
    expect(caller.log ?? []).toHaveLength(0);

    const reopened = createSubagentReplySink({ ...sinkContext, runtime: tabRuntime(caller), incarnation: 'other' });
    tabRuntime(caller).closing = false;
    reopened.started('a');
    reopened.completion('completed', 'x', 'a');
    expect(caller.log ?? []).toHaveLength(0);
  });

  it('accepts a prehandshake completion with no started and a null id', () => {
    const sink = humanSink();
    sink.completion('failed', 'no session', null);
    expect(caller.log).toHaveLength(1);
    expect(caller.log?.[0].output).toBe('Subagent Research failed.\n\nno session');
  });

  it('sends no ACP delivery and no provider id for a human caller', () => {
    humanSink().started('session-9');
    expect(deliver).not.toHaveBeenCalled();
    expect(caller.log?.[0].output).not.toContain('provider-1');
  });
});

describe('createSubagentReplySink — ACP callers', () => {
  it('delivers the exact started payload with distinct provider and internal ids', () => {
    acpSink().started('session-9');
    expect(deliver).toHaveBeenCalledWith(caller.label, 'ask', {
      runId: sinkContext.run.id,
      callerIncarnation: sinkContext.incarnation,
      callerRole: 'ask',
      callerSessionIdentity: 'internal-1',
      subagentRole: 'Research',
      message: { status: 'started', role: 'Research', sessionId: 'session-9', callerId: 'provider-1' },
    });
    expect(caller.log ?? []).toHaveLength(0);
  });

  it('delivers a completion using the latest executor id, never a human reply', () => {
    const sink = acpSink();
    sink.started('first');
    sink.completion('completed', 'answer', 'latest');
    const messages = deliveries().map((entry) => entry.message);
    expect(messages[0]).toMatchObject({ status: 'started', sessionId: 'first' });
    expect(messages[1]).toEqual({ status: 'completed', sessionId: 'latest', callerId: 'provider-1', output: 'answer' });
    expect(caller.log ?? []).toHaveLength(0);
  });

  it('drops queued deliveries when the captured session is closed before completion', async () => {
    const prompt = vi.fn(async () => ({ answered: true, reply: 'delivered' }));
    vi.spyOn(controller.managers.acp, 'promptResult').mockImplementation(prompt as never);
    vi.spyOn(controller.managers.acp, 'sessionIdentity').mockReturnValue('internal-1');
    vi.spyOn(controller.managers.agent, 'disposing', 'get').mockReturnValue(false);
    acpRoleRuntime(tabRuntime(caller), 'ask').prompt = { runningEntries: new Set() } as never;

    deliver.mockRestore();
    const sink = acpSink();
    sink.started('session-9');
    expect(prompt).not.toHaveBeenCalled();
    closeSubagentSession(controller.managers, caller.label, 'ask', tabRuntime(caller), 'internal-1');
    sink.completion('completed', 'answer', 'session-9');
    await Promise.resolve();
    expect(prompt).not.toHaveBeenCalled();
  });
});
