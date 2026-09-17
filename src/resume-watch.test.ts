import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from './bus.js';
import { ResumeWatch, RESUME_TICK_MS } from './resume-watch.js';

describe('resume watch', () => {
  afterEach(() => { vi.useRealTimers(); messageBus.clear(); });

  it('ignores normal ticks and emits the excess wall-clock gap once', () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    messageBus.on('system', 'resumed', listener);
    const watch = new ResumeWatch();
    watch.start();
    vi.advanceTimersByTime(RESUME_TICK_MS);
    expect(listener).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 60_000);
    vi.advanceTimersByTime(RESUME_TICK_MS);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: 'resumed', sleptMs: 60_000 });
    watch.stop();
    vi.advanceTimersByTime(60_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
