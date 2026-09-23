import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastQueue, TOAST_FADE_MS, TOAST_VISIBLE_MS } from './toast-queue';

describe('ToastQueue', () => {
  let queue: ToastQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new ToastQueue();
  });

  afterEach(() => {
    queue.dispose();
    vi.useRealTimers();
  });

  it('holds an added notification, visible, and notifies subscribers', () => {
    const seen: number[] = [];
    queue.subscribe((toasts) => { seen.push(toasts.length); });
    queue.add({ from: 'janus', message: 'deploy finished', color: '#abc' });
    expect(queue.all).toEqual([
      { id: 1, from: 'janus', message: 'deploy finished', color: '#abc', phase: 'visible', held: false },
    ]);
    expect(seen).toEqual([1]);
  });

  it('fades after the visible window and is gone after the fade', () => {
    queue.add({ from: 'janus', message: 'one' });
    vi.advanceTimersByTime(TOAST_VISIBLE_MS);
    expect(queue.all[0].phase).toBe('fading');
    vi.advanceTimersByTime(TOAST_FADE_MS);
    expect(queue.all).toHaveLength(0);
  });

  it('holds the clock while held and resumes with the time that was left', () => {
    queue.add({ from: 'janus', message: 'one' });
    vi.advanceTimersByTime(3000);
    queue.hold(1);
    expect(queue.all[0].held).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(queue.all[0].phase).toBe('visible');

    queue.release(1);
    vi.advanceTimersByTime(999);
    expect(queue.all[0].phase).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(queue.all[0].phase).toBe('fading');
  });

  // Holding a fading toast returns it to fully visible; releasing resumes the fade where it was.
  it('holds a fading toast and resumes its fade on release', () => {
    queue.add({ from: 'janus', message: 'one' });
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + 500);
    queue.hold(1);
    expect(queue.all[0]).toMatchObject({ phase: 'fading', held: true });

    vi.advanceTimersByTime(60_000);
    expect(queue.all).toHaveLength(1);

    queue.release(1);
    vi.advanceTimersByTime(TOAST_FADE_MS - 500);
    expect(queue.all).toHaveLength(0);
  });

  it('empties at once on clear, without fading', () => {
    queue.add({ from: 'janus', message: 'one' });
    queue.add({ from: 'janus', message: 'two' });
    queue.clear();
    expect(queue.all).toHaveLength(0);
  });

  it('stacks two toasts and expires each on its own clock', () => {
    queue.add({ from: 'janus', message: 'one' });
    vi.advanceTimersByTime(1000);
    queue.add({ from: 'build', message: 'two' });
    vi.advanceTimersByTime(TOAST_VISIBLE_MS + TOAST_FADE_MS - 1000);
    expect(queue.all.map((t) => t.message)).toEqual(['two']);
  });

  it('cancels every clock on dispose', () => {
    queue.add({ from: 'janus', message: 'one' });
    queue.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
