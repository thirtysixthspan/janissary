import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_REPLY_TIMEOUT_MS, CaptureRequestTracker } from './capture.js';

describe('CaptureRequestTracker', () => {
  it('settles overlapping requests for one process by their request ids', async () => {
    const tracker = new CaptureRequestTracker();
    const frames: { request: string }[] = [];
    const first = tracker.request('p1', 'session', (frame) => { frames.push(frame); });
    const second = tracker.request('p1', 'session', (frame) => { frames.push(frame); });

    tracker.resolve({ type: 'capture-reply', id: 'p1', request: frames[1]!.request, text: 'second', capturedAt: 2 });
    tracker.resolve({ type: 'capture-reply', id: 'p1', request: frames[0]!.request, text: 'first', capturedAt: 1 });

    await expect(first).resolves.toEqual({ text: 'first', capturedAt: 1 });
    await expect(second).resolves.toEqual({ text: 'second', capturedAt: 2 });
  });

  it('ignores a late reply after transport loss settles every request', async () => {
    const tracker = new CaptureRequestTracker();
    const frames: { request: string }[] = [];
    const pending = tracker.request('p1', 'session', (frame) => { frames.push(frame); });
    tracker.settleAll();
    tracker.resolve({ type: 'capture-reply', id: 'p1', request: frames[0]!.request });

    await expect(pending).resolves.toBeUndefined();
  });

  it('settles a failed request with the given reason, leaving another pending request untouched', async () => {
    const tracker = new CaptureRequestTracker();
    const frames: { request: string }[] = [];
    const failed = tracker.request('p1', 'session', (frame) => { frames.push(frame); });
    const other = tracker.request('p2', 'session', (frame) => { frames.push(frame); });

    tracker.fail(frames[0]!.request, 'Remote connection unavailable.');

    await expect(failed).resolves.toEqual({ error: 'Remote connection unavailable.' });
    tracker.resolve({ type: 'capture-reply', id: 'p2', request: frames[1]!.request, text: 'second', capturedAt: 2 });
    await expect(other).resolves.toEqual({ text: 'second', capturedAt: 2 });
  });
});

// A far side that never answers would otherwise leave `harness capture` waiting, with nothing on
// screen, until the channel itself closed.
describe('CaptureRequestTracker deadline', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('settles a request the far side never answers with a timeout after fifteen seconds', async () => {
    const tracker = new CaptureRequestTracker();
    const pending = tracker.request('p1', 'session', () => {});
    await vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ error: 'Remote capture query timed out.' });
  });

  it('leaves a reply that arrives before the deadline untouched by it', async () => {
    const tracker = new CaptureRequestTracker();
    const frames: { request: string }[] = [];
    const pending = tracker.request('p1', 'session', (frame) => { frames.push(frame); });
    tracker.resolve({ type: 'capture-reply', id: 'p1', request: frames[0]!.request, text: 'screen', capturedAt: 1 });
    await vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ text: 'screen', capturedAt: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
