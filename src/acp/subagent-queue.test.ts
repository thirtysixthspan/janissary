import { describe, expect, it } from 'vitest';
import type { SubagentDelivery, SubagentMessage } from '../subagent/messages.js';
import type { TabRuntime } from '../tab/types.js';
import { acpRoleRuntime, existingAcpRoleRuntime } from './role-state.js';
import { enqueueSubagentMessage } from './subagent-queue.js';

function delivery(
  runId: string,
  status: SubagentMessage['status'],
  overrides: Partial<SubagentDelivery> = {},
): SubagentDelivery {
  return {
    runId,
    callerIncarnation: 'incarnation-1',
    callerRole: 'ask',
    callerSessionIdentity: 'acp-session-1',
    subagentRole: 'research',
    message: status === 'started'
      ? { status, role: 'research', sessionId: 'provider-session', callerId: 'provider-caller' }
      : { status, sessionId: 'provider-session', callerId: 'provider-caller', output: 'answer' },
    ...overrides,
  };
}

function shape(entries: readonly SubagentDelivery[]): string[] {
  return entries.map((entry) => `${entry.runId}:${entry.message.status}`);
}

describe('enqueueSubagentMessage', () => {
  it('appends to an empty queue without mutating the input', () => {
    const pending: SubagentDelivery[] = [];
    const incoming = delivery('a', 'started');

    const result = enqueueSubagentMessage(pending, incoming);

    expect(result).toEqual([incoming]);
    expect(result).not.toBe(pending);
    expect(pending).toEqual([]);
  });

  it('appends at the tail in arrival order for interleaved runs', () => {
    const aStarted = delivery('a', 'started');
    const bStarted = delivery('b', 'started');
    const first = enqueueSubagentMessage([], aStarted);
    const second = enqueueSubagentMessage(first, bStarted);

    expect(shape(first)).toEqual(['a:started']);
    expect(shape(second)).toEqual(['a:started', 'b:started']);
    expect(shape(enqueueSubagentMessage(second, delivery('c', 'started'))))
      .toEqual(['a:started', 'b:started', 'c:started']);
  });

  it('drops only the completing run\'s queued started and appends the completion at the tail', () => {
    const aStarted = delivery('a', 'started');
    const bCompleted = delivery('b', 'completed');
    const aCompleted = delivery('a', 'completed');
    const pending = [aStarted, bCompleted];
    const original = [...pending];

    const result = enqueueSubagentMessage(pending, aCompleted);

    expect(shape(result)).toEqual(['b:completed', 'a:completed']);
    expect(result[1]).toBe(aCompleted);
    expect(pending).toEqual(original);
  });

  it('retains unrelated started messages and already queued completions in order', () => {
    const pending = [
      delivery('a', 'started'),
      delivery('b', 'started'),
      delivery('c', 'completed'),
    ];

    expect(shape(enqueueSubagentMessage(pending, delivery('a', 'failed'))))
      .toEqual(['b:started', 'c:completed', 'a:failed']);
  });

  it('appends a completion whose started was already consumed', () => {
    const pending = [delivery('b', 'started')];

    expect(shape(enqueueSubagentMessage(pending, delivery('a', 'completed'))))
      .toEqual(['b:started', 'a:completed']);
  });

  it('never deduplicates completions', () => {
    const first = delivery('a', 'completed');
    const second = delivery('a', 'completed');

    expect(enqueueSubagentMessage([first], second)).toEqual([first, second]);
  });
});

describe('per-role queues on a tab runtime', () => {
  it('keeps ask and tell queues independent on one tab', () => {
    const runtime: TabRuntime = { busy: false, context: [], queue: [] };
    const ask = delivery('ask-run', 'started', { callerRole: 'ask' });
    const tell = delivery('tell-run', 'started', { callerRole: 'tell' });

    acpRoleRuntime(runtime, 'ask').pendingSubagentMessages = [ask];
    acpRoleRuntime(runtime, 'tell').pendingSubagentMessages = [tell];

    expect(acpRoleRuntime(runtime, 'ask').pendingSubagentMessages).toEqual([ask]);
    expect(acpRoleRuntime(runtime, 'tell').pendingSubagentMessages).toEqual([tell]);
  });

  it('keeps queues independent across two caller tabs', () => {
    const first: TabRuntime = { busy: false, context: [], queue: [] };
    const second: TabRuntime = { busy: false, context: [], queue: [] };
    const one = delivery('one', 'started');
    const two = delivery('two', 'completed');

    acpRoleRuntime(first).pendingSubagentMessages = [one];
    expect(acpRoleRuntime(first).pendingSubagentMessages).toEqual([one]);
    expect(existingAcpRoleRuntime(second)?.pendingSubagentMessages).toBeUndefined();

    acpRoleRuntime(second, 'tell').pendingSubagentMessages = [two];
    expect(acpRoleRuntime(second, 'tell').pendingSubagentMessages).toEqual([two]);
    expect(acpRoleRuntime(first, 'tell').pendingSubagentMessages).toBeUndefined();
  });
});
