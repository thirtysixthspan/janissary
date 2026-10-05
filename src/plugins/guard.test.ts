import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardPluginCall } from './guard.js';

// The deadline a plugin handler runs under, and the one way out of it: work the host does on the
// plugin's behalf, which is the host's time rather than the plugin's.
describe('guardPluginCall', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function after<Value>(ms: number, value: Value): Promise<Value> {
    return new Promise((resolve) => { setTimeout(() => { resolve(value); }, ms); });
  }

  it('resolves with what a call returns inside its deadline', async () => {
    const guarded = guardPluginCall(() => after(10, 'done'), 50);
    await vi.advanceTimersByTimeAsync(10);
    await expect(guarded).resolves.toBe('done');
  });

  it('rejects a call that runs past its deadline', async () => {
    const guarded = guardPluginCall(() => after(100, 'late'), 50);
    const settled = expect(guarded).rejects.toThrow('handler timed out after 50 ms');
    await vi.advanceTimersByTimeAsync(50);
    await settled;
  });

  it('does not charge exempted host work to the call', async () => {
    const guarded = guardPluginCall((deadline) => deadline.exempt(() => after(500, 'reply')), 50);
    await vi.advanceTimersByTimeAsync(500);
    await expect(guarded).resolves.toBe('reply');
  });

  it('keeps one clock across overlapping exempted work', async () => {
    const guarded = guardPluginCall((deadline) => Promise.all([
      deadline.exempt(() => after(200, 'a')),
      deadline.exempt(() => after(400, 'b')),
    ]), 50);
    await vi.advanceTimersByTimeAsync(400);
    await expect(guarded).resolves.toEqual(['a', 'b']);
  });

  it('still counts the plugin time on either side of exempted work', async () => {
    const guarded = guardPluginCall(async (deadline) => {
      await after(30, null);
      await deadline.exempt(() => after(500, null));
      return after(30, 'too slow');
    }, 50);
    const settled = expect(guarded).rejects.toThrow('handler timed out after 50 ms');
    await vi.advanceTimersByTimeAsync(30 + 500 + 20);
    await settled;
  });
});
