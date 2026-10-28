import { describe, it, expect, vi } from 'vitest';
import { handleQueueKey } from './queue-picker-keys';

function fakeEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key });
}

describe('handleQueueKey', () => {
  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    expect(handleQueueKey(e, ['a', 'b'], 1, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    expect(handleQueueKey(e, ['a', 'b'], 0, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(1)).toBe(1);
  });

  it('Enter is a no-op: does not close, select, or run anything', () => {
    const setQueueOpen = vi.fn();
    expect(handleQueueKey(fakeEvent('Enter'), ['a'], 0, vi.fn(), setQueueOpen)).toBe(true);
    expect(setQueueOpen).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const setQueueOpen = vi.fn();
    expect(handleQueueKey(fakeEvent('Escape'), ['a'], 0, vi.fn(), setQueueOpen)).toBe(true);
    expect(setQueueOpen).toHaveBeenCalledWith(false);
  });

  it('returns false for printable keys and Backspace, so they fall through to the textarea', () => {
    expect(handleQueueKey(fakeEvent('x'), ['a'], 0, vi.fn(), vi.fn())).toBe(false);
    expect(handleQueueKey(fakeEvent('Backspace'), ['a'], 0, vi.fn(), vi.fn())).toBe(false);
  });
});
