import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('holds the value it was given until the delay has passed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('ab');
  });

  it('settles on the last value typed, not an intermediate one', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => {
      const settled = useDebouncedValue(value, 200);
      onChange(settled);
    }, { initialProps: { value: '' } });
    for (const value of ['t', 'to', 'tod', 'todo']) {
      rerender({ value });
      act(() => { vi.advanceTimersByTime(50); });
    }
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenLastCalledWith('todo');
  });

  it('never lands a value that settled after unmount', () => {
    const onChange = vi.fn();
    const { unmount, rerender } = renderHook(({ value }) => {
      onChange(useDebouncedValue(value, 200));
    }, { initialProps: { value: 'a' } });
    rerender({ value: 'ab' });
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(onChange).not.toHaveBeenCalledWith('ab');
  });
});
