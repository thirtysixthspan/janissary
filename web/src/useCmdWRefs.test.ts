import { renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { useCmdWRefs } from './useCmdWRefs';
import { OVERLAYS, type OverlayName, type OverlayOpenState } from './pickers/overlay-registry';
import { openContributedOverlay, registerContributedOverlay } from './shared/contributed-overlays';

const NONE: OverlayOpenState = {
  syntaxTheme: false, appTheme: false, quickOpen: false,
  tabNav: false, history: false, queue: false, task: false, profile: false,
};

const opened = (name: OverlayName): OverlayOpenState => ({ ...NONE, [name]: true });
const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length > 0) cleanups.pop()?.(); });

describe('useCmdWRefs', () => {
  it('mirrors the plain arguments into their matching refs', () => {
    const { result } = renderHook(() => useCmdWRefs(2, false, false, NONE));
    expect(result.current.activeTabRef.current).toBe(2);
    expect(result.current.quitConfirmOpenRef.current).toBe(false);
    expect(result.current.keyboardCapturedRef.current).toBe(false);
  });

  it('ORs quitConfirmOpen with unsavedQuitOpen', () => {
    const { result } = renderHook(() => useCmdWRefs(0, false, true, NONE));
    expect(result.current.quitConfirmOpenRef.current).toBe(true);
  });

  // Every overlay suppresses the chord, not a hand-picked subset of them: this used to OR four of
  // the eight by name, so Cmd+W under the syntax-theme picker, the app-theme picker, the tab
  // navigator, or quick open closed the tab underneath the overlay.
  it.each(OVERLAYS.map((overlay) => overlay.name))('raises keyboardCapturedRef while %s is open', (name) => {
    const { result } = renderHook(() => useCmdWRefs(0, false, false, opened(name)));
    expect(result.current.keyboardCapturedRef.current).toBe(true);
  });

  it('raises keyboardCapturedRef while a contributed overlay is open', () => {
    cleanups.push(registerContributedOverlay({
      name: 'clipboard-history', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    }));
    openContributedOverlay('clipboard-history', null);

    const { result } = renderHook(() => useCmdWRefs(0, false, false, NONE));

    expect(result.current.keyboardCapturedRef.current).toBe(true);
  });

  it('updates ref values on rerender without changing ref identity', () => {
    const { result, rerender } = renderHook(
      ({ activeTab }) => useCmdWRefs(activeTab, false, false, NONE),
      { initialProps: { activeTab: 0 } },
    );
    const ref = result.current.activeTabRef;
    rerender({ activeTab: 3 });
    expect(result.current.activeTabRef).toBe(ref);
    expect(result.current.activeTabRef.current).toBe(3);
  });

  it('lowers keyboardCapturedRef again once the overlay closes', () => {
    const { result, rerender } = renderHook(
      ({ overlays }) => useCmdWRefs(0, false, false, overlays),
      { initialProps: { overlays: opened('quickOpen') } },
    );
    expect(result.current.keyboardCapturedRef.current).toBe(true);
    rerender({ overlays: NONE });
    expect(result.current.keyboardCapturedRef.current).toBe(false);
  });
});
