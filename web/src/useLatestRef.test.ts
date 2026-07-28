import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLatestRef } from './useLatestRef';

describe('useLatestRef', () => {
  it('returns a ref initialized to the given value', () => {
    const { result } = renderHook(() => useLatestRef('first'));
    expect(result.current.current).toBe('first');
  });

  it('updates the ref to the latest value on rerender without changing ref identity', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'first' },
    });
    const ref = result.current;
    rerender({ value: 'second' });
    expect(result.current).toBe(ref);
    expect(result.current.current).toBe('second');
  });
});
