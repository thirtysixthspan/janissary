import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCmdWRefs } from './useCmdWRefs';

describe('useCmdWRefs', () => {
  it('mirrors the plain arguments into their matching refs', () => {
    const { result } = renderHook(() => useCmdWRefs(2, false, false, false, false, false, false, null, 'agent'));
    expect(result.current.activeTabRef.current).toBe(2);
    expect(result.current.quitConfirmOpenRef.current).toBe(false);
    expect(result.current.pickerOpenRef.current).toBe(false);
    expect(result.current.routeRef.current).toBeNull();
    expect(result.current.activeViewRef.current).toBe('agent');
  });

  it('ORs quitConfirmOpen with unsavedQuitOpen', () => {
    const { result } = renderHook(() => useCmdWRefs(0, false, true, false, false, false, false, null, undefined));
    expect(result.current.quitConfirmOpenRef.current).toBe(true);
  });

  it('ORs pickerOpen with queueOpen, taskPickerOpen, and profilePickerOpen', () => {
    const { result } = renderHook(() => useCmdWRefs(0, false, false, false, false, false, true, null, undefined));
    expect(result.current.pickerOpenRef.current).toBe(true);
  });

  it('updates ref values on rerender without changing ref identity', () => {
    const { result, rerender } = renderHook(
      ({ activeTab }) => useCmdWRefs(activeTab, false, false, false, false, false, false, null, undefined),
      { initialProps: { activeTab: 0 } },
    );
    const ref = result.current.activeTabRef;
    rerender({ activeTab: 3 });
    expect(result.current.activeTabRef).toBe(ref);
    expect(result.current.activeTabRef.current).toBe(3);
  });
});
