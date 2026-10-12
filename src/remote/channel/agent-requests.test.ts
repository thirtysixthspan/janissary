import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteAgentRequests } from './agent-requests.js';
import type { ClientFrame } from '../protocol-frames.js';

const snapshot = { taskPath: '/remote/ai/tasks/fix.md', taskText: 'Fix it.', skills: [], grants: [] };

describe('RemoteAgentRequests', () => {
  afterEach(() => vi.useRealTimers());

  it('sends an execution-host resolution request and settles with its correlated snapshot', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.request('fix.md', ['review'], send);
    const request = send.mock.calls[0]?.[0];
    expect(request).toMatchObject({ type: 'agent-resolve', task: 'fix.md', skills: ['review'] });
    if (request?.type !== 'agent-resolve') throw new Error('Expected agent resolution request.');

    tracker.resolve({ type: 'agent-resolve-result', id: request.id, snapshot });

    await expect(pending).resolves.toEqual(snapshot);
  });

  it('correlates concurrent workspace requests independently', async () => {
    const tracker = new RemoteAgentRequests();
    const sent: ClientFrame[] = [];
    const first = tracker.request('one.md', [], (frame) => { sent.push(frame); });
    const second = tracker.request('two.md', [], (frame) => { sent.push(frame); });
    const requests = sent.filter((frame): frame is Extract<ClientFrame, { type: 'agent-resolve' }> => frame.type === 'agent-resolve');

    tracker.resolve({ type: 'agent-resolve-result', id: requests[1]!.id, snapshot: { ...snapshot, taskText: 'Second.' } });
    tracker.resolve({ type: 'agent-resolve-result', id: requests[0]!.id, snapshot });

    await expect(first).resolves.toEqual(snapshot);
    await expect(second).resolves.toMatchObject({ taskText: 'Second.' });
  });

  it('settles a disconnected request and bounds a silent remote', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const pending = tracker.request('fix.md', [], vi.fn());
    tracker.failAll('Remote connection lost.');
    await expect(pending).rejects.toThrow('Remote connection lost.');

    const timed = tracker.request('fix.md', [], vi.fn());
    const expectation = expect(timed).rejects.toThrow('Remote agent resolution timed out.');
    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });
});
