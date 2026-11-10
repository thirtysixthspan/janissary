import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransientValue } from './useTransientValue';

describe('useTransientValue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts empty, shows a value, and clears it after the duration', () => {
    const { result } = renderHook(() => useTransientValue<string>(1000));
    expect(result.current[0]).toBeNull();
    act(() => { result.current[1]('a'); });
    expect(result.current[0]).toBe('a');
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current[0]).toBe('a');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current[0]).toBeNull();
  });

  it('restarts the timer and replaces the value on a second show', () => {
    const { result } = renderHook(() => useTransientValue<string>(1000));
    act(() => { result.current[1]('a'); });
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { result.current[1]('b'); });
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current[0]).toBe('b');
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current[0]).toBeNull();
  });

  it('clears immediately and leaves no timer behind', () => {
    const { result } = renderHook(() => useTransientValue<string>(1000));
    act(() => { result.current[1]('a'); });
    act(() => { result.current[2](); });
    expect(result.current[0]).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the pending timer on unmount', () => {
    const { result, unmount } = renderHook(() => useTransientValue<string>(1000));
    act(() => { result.current[1]('a'); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
