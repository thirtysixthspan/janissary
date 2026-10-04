import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStatusWindows } from './useStatusWindows';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStatusWindows', () => {
  it('auto-shows a window on activation and fades it out after 5s', () => {
    const { result } = renderHook(() => useStatusWindows('tab1'));
    expect(result.current.connections.visible).toBe(true);
    expect(result.current.connections.opacity).toBe(1);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.connections.opacity).toBe(0);
    expect(result.current.connections.visible).toBe(true);

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.connections.visible).toBe(false);
  });

  // Emptiness is the panel's question now, not the hook's: this hook holds only visibility, and
  // `StatusPanels` refuses to draw a window with no rows. A caller passing nothing still gets a
  // window that arms and fades — nothing renders, because there is nothing to render.
  it('arms and fades regardless of content, leaving the emptiness test to the panel', () => {
    const { result } = renderHook(() => useStatusWindows('tab1'));
    expect(result.current.connections.visible).toBe(true);
    act(() => { vi.advanceTimersByTime(5300); });
    expect(result.current.connections.visible).toBe(false);
  });

  it('cancels the fade and keeps the window visible when entered during the auto-show', () => {
    const { result } = renderHook(() => useStatusWindows('tab1'));

    act(() => { result.current.connections.onWindowEnter(); });
    act(() => { vi.advanceTimersByTime(5300); });

    expect(result.current.connections.visible).toBe(true);
    expect(result.current.connections.opacity).toBe(1);
  });

  it('hides on leave after hover once the auto-show has been cancelled', () => {
    const { result } = renderHook(() => useStatusWindows('tab1'));

    act(() => { result.current.connections.onButtonEnter(); });
    act(() => { result.current.connections.onButtonLeave(); });

    expect(result.current.connections.visible).toBe(false);
  });

  it('pins the window open on click, and unpins on a second click', () => {
    const { result } = renderHook(() => useStatusWindows('tab1'));

    act(() => { vi.advanceTimersByTime(5300); });
    expect(result.current.connections.visible).toBe(false);

    act(() => { result.current.connections.onButtonClick(); });
    expect(result.current.connections.visible).toBe(true);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.connections.visible).toBe(true);

    act(() => { result.current.connections.onButtonClick(); });
    expect(result.current.connections.visible).toBe(false);
  });

  it('re-arms the auto-show independently for each window on tab re-activation', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useStatusWindows(key),
      { initialProps: { key: 'tab1' } },
    );

    act(() => { vi.advanceTimersByTime(5300); });
    expect(result.current.connections.visible).toBe(false);
    expect(result.current.schedule.visible).toBe(false);

    rerender({ key: 'tab2' });
    expect(result.current.connections.visible).toBe(true);
    expect(result.current.schedule.visible).toBe(true);
  });

  it('re-arms when a window gains its first row after the initial auto-show ends', () => {
    const { result, rerender } = renderHook(
      ({ hasContent }) => useStatusWindows('shell', { active: true, connectionsHaveContent: hasContent }),
      { initialProps: { hasContent: false } },
    );

    act(() => { vi.advanceTimersByTime(5300); });
    expect(result.current.connections.visible).toBe(false);

    rerender({ hasContent: true });

    expect(result.current.connections.visible).toBe(true);
    expect(result.current.connections.opacity).toBe(1);
  });

  it('re-arms a hidden tab when it becomes active again', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useStatusWindows('shell', { active, connectionsHaveContent: true }),
      { initialProps: { active: true } },
    );

    act(() => { vi.advanceTimersByTime(5300); });
    expect(result.current.connections.visible).toBe(false);

    rerender({ active: false });
    expect(result.current.connections.visible).toBe(false);

    rerender({ active: true });
    expect(result.current.connections.visible).toBe(true);
  });
});
