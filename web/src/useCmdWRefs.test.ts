import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCmdWRefs } from './useCmdWRefs';
import { OVERLAYS, type OverlayName, type OverlayOpenState } from './pickers/overlay-registry';

const NONE: OverlayOpenState = {
  route: false, syntaxTheme: false, appTheme: false, quickOpen: false,
  tabNav: false, history: false, queue: false, task: false, profile: false,
};

const opened = (name: OverlayName): OverlayOpenState => ({ ...NONE, [name]: true });

describe('useCmdWRefs', () => {
  it('mirrors the plain arguments into their matching refs', () => {
    const { result } = renderHook(() => useCmdWRefs(2, false, false, NONE, null));
    expect(result.current.activeTabRef.current).toBe(2);
    expect(result.current.quitConfirmOpenRef.current).toBe(false);
    expect(result.current.pickerOpenRef.current).toBe(false);
    expect(result.current.routeRef.current).toBeNull();
  });

  it('ORs quitConfirmOpen with unsavedQuitOpen', () => {
    const { result } = renderHook(() => useCmdWRefs(0, false, true, NONE, null));
    expect(result.current.quitConfirmOpenRef.current).toBe(true);
  });

  // Every overlay suppresses the chord, not a hand-picked subset of them: this used to OR four of
  // the nine by name, so Cmd+W under the syntax-theme picker, the app-theme picker, the tab
  // navigator, or quick open closed the tab underneath the overlay.
  it.each(OVERLAYS.map((overlay) => overlay.name))('raises pickerOpenRef while %s is open', (name) => {
    const { result } = renderHook(() => useCmdWRefs(0, false, false, opened(name), null));
    expect(result.current.pickerOpenRef.current).toBe(true);
  });

  it('updates ref values on rerender without changing ref identity', () => {
    const { result, rerender } = renderHook(
      ({ activeTab }) => useCmdWRefs(activeTab, false, false, NONE, null),
      { initialProps: { activeTab: 0 } },
    );
    const ref = result.current.activeTabRef;
    rerender({ activeTab: 3 });
    expect(result.current.activeTabRef).toBe(ref);
    expect(result.current.activeTabRef.current).toBe(3);
  });

  it('lowers pickerOpenRef again once the overlay closes', () => {
    const { result, rerender } = renderHook(
      ({ overlays }) => useCmdWRefs(0, false, false, overlays, null),
      { initialProps: { overlays: opened('quickOpen') } },
    );
    expect(result.current.pickerOpenRef.current).toBe(true);
    rerender({ overlays: NONE });
    expect(result.current.pickerOpenRef.current).toBe(false);
  });
});
