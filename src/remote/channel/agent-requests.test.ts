import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteAgentRequests } from './agent-requests.js';
import type { ClientFrame } from '../protocol-frames.js';

const snapshot = { taskPath: '/remote/ai/tasks/fix.md', taskText: 'Fix it.', skills: [], grants: [] };
type CloneRequest = Extract<ClientFrame, { type: 'run-clone' }>;

function cloneRequest(send: ReturnType<typeof vi.fn<(frame: ClientFrame) => void>>): CloneRequest {
  const frame = send.mock.calls[0]?.[0];
  if (frame?.type !== 'run-clone') throw new Error('Expected run-clone request.');
  return frame;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('node:crypto');
});

describe('RemoteAgentRequests — agent resolution', () => {
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

  it('forwards a selected workspace only on the agent-resolve frame', () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    tracker.request('fix.md', ['review'], send, 'agent-run1');

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'agent-resolve', id: expect.any(String), task: 'fix.md', skills: ['review'], workspace: 'agent-run1',
    });
  });

  it('leaves the agent-resolve frame unchanged when no workspace is selected', () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    tracker.request('fix.md', ['review'], send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'agent-resolve', id: expect.any(String), task: 'fix.md', skills: ['review'],
    });
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty('workspace');
  });

  it('correlates two selected task requests answered out of order', async () => {
    const tracker = new RemoteAgentRequests();
    const sent: ClientFrame[] = [];
    const first = tracker.request('one.md', [], (frame) => { sent.push(frame); }, 'clone-a');
    const second = tracker.request('two.md', [], (frame) => { sent.push(frame); }, 'clone-b');
    const requests = sent.filter((frame): frame is Extract<ClientFrame, { type: 'agent-resolve' }> => frame.type === 'agent-resolve');
    expect(requests.map((frame) => frame.workspace)).toEqual(['clone-a', 'clone-b']);

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

describe('RemoteAgentRequests — run clones', () => {
  it.each(['create', 'release'] as const)('sends a %s with its label and action', (action) => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    void tracker.runClone(action, 'subagent-run1', send);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'run-clone', id: expect.any(String), action, label: 'subagent-run1',
    });
  });

  it('resolves a create to the directory of its correlated result', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('create', 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: request.id, dir: '/srv/ws/run1' });

    await expect(pending).resolves.toBe('/srv/ws/run1');
  });

  it('resolves a release to undefined on an id-only result', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('release', 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: request.id });

    await expect(pending).resolves.toBeUndefined();
  });

  it.each(['create', 'release'] as const)('rejects with the exact server error for %s', async (action) => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone(action, 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: request.id, error: 'clone refused: 🌍' });

    await expect(pending).rejects.toThrow('clone refused: 🌍');
  });

  it('correlates concurrent creates and releases answered out of order', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const sent: ClientFrame[] = [];
    const first = tracker.runClone('create', 'run-a', (frame) => { sent.push(frame); });
    const second = tracker.runClone('release', 'run-b', (frame) => { sent.push(frame); });
    const requests = sent.filter((frame): frame is CloneRequest => frame.type === 'run-clone');

    tracker.resolve({ type: 'run-clone-result', id: requests[1]!.id });
    tracker.resolve({ type: 'run-clone-result', id: requests[0]!.id, dir: '/srv/ws/run-a' });

    await expect(first).resolves.toBe('/srv/ws/run-a');
    await expect(second).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores unknown, duplicate and late replies', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('create', 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: 'unknown', dir: '/wrong' });
    tracker.resolve({ type: 'run-clone-result', id: request.id, dir: '/srv/ws/run1' });
    tracker.resolve({ type: 'run-clone-result', id: request.id, error: 'late failure' });
    tracker.failAll('late drain');

    await expect(pending).resolves.toBe('/srv/ws/run1');
  });

  it('answers a synchronous loopback reply without losing the settlement', async () => {
    const tracker = new RemoteAgentRequests();
    const pending = tracker.runClone('create', 'run1', (frame) => {
      if (frame.type !== 'run-clone') throw new Error('Expected run-clone request.');
      tracker.resolve({ type: 'run-clone-result', id: frame.id, dir: '/srv/ws/loopback' });
    });

    await expect(pending).resolves.toBe('/srv/ws/loopback');
  });

  it('rejects a create that answers without a directory', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('create', 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: request.id });

    await expect(pending).rejects.toThrow('Remote run clone create returned no directory.');
  });

  it('rejects a release that answers with a directory', async () => {
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('release', 'run1', send);
    const request = cloneRequest(send);

    tracker.resolve({ type: 'run-clone-result', id: request.id, dir: '/srv/ws/run1' });

    await expect(pending).rejects.toThrow('Remote run clone release returned an unexpected directory.');
  });

  it('keeps the two families isolated when an agent request and a clone share an id', async () => {
    const ids = ['shared-id', 'shared-id'];
    vi.doMock('node:crypto', () => ({ randomUUID: () => ids.shift() ?? 'other' }));
    vi.resetModules();
    const { RemoteAgentRequests: FreshRequests } = await import('./agent-requests.js');
    const tracker = new FreshRequests();
    const sent: ClientFrame[] = [];
    const agent = tracker.request('fix.md', [], (frame) => { sent.push(frame); });
    const clone = tracker.runClone('create', 'run1', (frame) => { sent.push(frame); });
    expect(sent.map((frame) => 'id' in frame && frame.id)).toEqual(['shared-id', 'shared-id']);

    tracker.resolve({ type: 'run-clone-result', id: 'shared-id', dir: '/srv/ws/run1' });
    await expect(clone).resolves.toBe('/srv/ws/run1');

    let settled = false;
    void agent.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    tracker.resolve({ type: 'agent-resolve-result', id: 'shared-id', snapshot });
    await expect(agent).resolves.toEqual(snapshot);
  });
});

describe('RemoteAgentRequests — deadlines and termination', () => {
  it('leaves a create pending beyond 15 seconds with no timer at all', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const pending = tracker.runClone('create', 'run1', vi.fn());
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(settled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const send = vi.fn<(frame: ClientFrame) => void>();
    const second = tracker.runClone('create', 'run2', send);
    tracker.resolve({ type: 'run-clone-result', id: cloneRequest(send).id, dir: '/srv/ws/run2' });
    await expect(second).resolves.toBe('/srv/ws/run2');
  });

  it('times out a release exactly at 15 seconds and clears its timer', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const pending = tracker.runClone('release', 'run1', vi.fn());
    expect(vi.getTimerCount()).toBe(1);

    const expectation = expect(pending).rejects.toThrow('Remote run clone release timed out.');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a release timer on an early answer so a later advance cannot reject it', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const pending = tracker.runClone('release', 'run1', send);
    expect(vi.getTimerCount()).toBe(1);

    tracker.resolve({ type: 'run-clone-result', id: cloneRequest(send).id });
    await expect(pending).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toBeUndefined();
  });

  it('failAll rejects mixed create, release and agent requests and clears release timers', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const sent: ClientFrame[] = [];
    const create = tracker.runClone('create', 'run-a', (frame) => { sent.push(frame); });
    const release = tracker.runClone('release', 'run-b', (frame) => { sent.push(frame); });
    const agent = tracker.request('fix.md', [], (frame) => { sent.push(frame); });
    expect(vi.getTimerCount()).toBe(2);

    tracker.failAll('Remote connection lost.');

    await expect(create).rejects.toThrow('Remote connection lost.');
    await expect(release).rejects.toThrow('Remote connection lost.');
    await expect(agent).rejects.toThrow('Remote connection lost.');
    expect(vi.getTimerCount()).toBe(0);

    const cloneIds = sent.filter((frame): frame is CloneRequest => frame.type === 'run-clone').map((frame) => frame.id);
    for (const id of cloneIds) tracker.resolve({ type: 'run-clone-result', id, dir: '/srv/ws/late' });
    tracker.failAll('again');
    await expect(create).rejects.toThrow('Remote connection lost.');
  });
});

describe('RemoteAgentRequests — send failures', () => {
  it.each(['create', 'release'] as const)('returns an already-rejected promise when a %s send throws', async (action) => {
    const tracker = new RemoteAgentRequests();
    const failure = new Error('write refused');
    const pending = tracker.runClone(action, 'run1', () => { throw failure; });

    await expect(pending).rejects.toBe(failure);
  });

  it('returns an already-rejected promise when an agent resolution send throws', async () => {
    const tracker = new RemoteAgentRequests();
    const failure = new Error('write refused');
    const pending = tracker.request('fix.md', [], () => { throw failure; });

    await expect(pending).rejects.toBe(failure);
  });

  it('wraps a thrown non-Error through errorText', async () => {
    const tracker = new RemoteAgentRequests();
    const pending = tracker.runClone('create', 'run1', () => { throw 'plain failure'; });

    await expect(pending).rejects.toThrow('plain failure');
    await expect(pending).rejects.not.toBe('plain failure');
  });

  it('keeps a synchronous success when the sender throws afterwards', async () => {
    const tracker = new RemoteAgentRequests();
    const pending = tracker.runClone('create', 'run1', (frame) => {
      if (frame.type !== 'run-clone') throw new Error('Expected run-clone request.');
      tracker.resolve({ type: 'run-clone-result', id: frame.id, dir: '/srv/ws/first' });
      throw new Error('throw after answering');
    });

    await expect(pending).resolves.toBe('/srv/ws/first');
  });

  it('cannot be revived by a late reply or a repeated failAll after a send throw', async () => {
    vi.useFakeTimers();
    const tracker = new RemoteAgentRequests();
    const send = vi.fn<(frame: ClientFrame) => void>();
    const failure = new Error('write refused');
    const pending = tracker.runClone('release', 'run1', (frame) => {
      if (frame.type === 'run-clone') send(frame);
      throw failure;
    });
    const expectation = expect(pending).rejects.toBe(failure);
    const id = cloneRequest(send).id;

    tracker.resolve({ type: 'run-clone-result', id });
    tracker.failAll('later drain');
    await vi.advanceTimersByTimeAsync(20_000);

    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });
});
