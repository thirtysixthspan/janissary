import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useWindowFocus } from './useWindowFocus';

describe('useWindowFocus', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reflects document.hasFocus() being true on initial render', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { result } = renderHook(() => useWindowFocus());
    expect(result.current).toBe(true);
  });

  it('reflects document.hasFocus() being false on initial render', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { result } = renderHook(() => useWindowFocus());
    expect(result.current).toBe(false);
  });

  it('flips to false when the window blurs', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { result } = renderHook(() => useWindowFocus());
    act(() => { globalThis.dispatchEvent(new Event('blur')); });
    expect(result.current).toBe(false);
  });

  it('flips back to true when the window regains focus', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { result } = renderHook(() => useWindowFocus());
    act(() => { globalThis.dispatchEvent(new Event('blur')); });
    act(() => { globalThis.dispatchEvent(new Event('focus')); });
    expect(result.current).toBe(true);
  });

  it('removes its listeners on unmount', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const { unmount } = renderHook(() => useWindowFocus());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
  });
});
