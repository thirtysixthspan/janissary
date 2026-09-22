import { describe, expect, it } from 'vitest';
import { CaptureRequestTracker } from './channel-capture.js';

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
