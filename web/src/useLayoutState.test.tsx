import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from './shared/ws/ws';
import { useLayoutState } from './useLayoutState';
import { DEFAULT_REPORTING_PCT, DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SPLIT_PCT } from './layout-defaults';

type LayoutEvent = {
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  splitPct?: number;
  focusLeft?: 'files' | 'notifications' | 'schedules';
  focusRight?: 'files' | 'notifications' | 'schedules';
};

function makeClient() {
  let listener: ((event: LayoutEvent) => void) | null = null;
  let connectionListener: ((phase: 'connected' | 'reconnecting' | 'escalated') => void) | null = null;
  const reportLayout = vi.fn();
  const client = {
    onLayout: (l: (event: LayoutEvent) => void) => { listener = l; return () => {}; },
    onConnectionStatus: (l: typeof connectionListener) => { connectionListener = l; return () => {}; },
    reportLayout,
  } as unknown as JanusClient;
  return {
    client,
    emitLayout: (event: LayoutEvent) => listener?.(event),
    emitConnectionStatus: (phase: 'connected' | 'reconnecting' | 'escalated') => connectionListener?.(phase),
    reportLayout,
  };
}

describe('useLayoutState', () => {
  it('a completed sidebar-left drag reports the new sizes to the server', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));
    reportLayout.mockClear();

    act(() => result.current.setSidebarLeftWidth(400));

    expect(result.current.sidebarLeftWidth).toBe(400);
    expect(reportLayout).toHaveBeenCalledWith(400, DEFAULT_SIDEBAR_WIDTH_PX, 100 - DEFAULT_REPORTING_PCT, DEFAULT_SPLIT_PCT);
  });

  it('a completed sidebar-right drag reports the new sizes to the server', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));
    reportLayout.mockClear();

    act(() => result.current.setSidebarRightWidth(250));

    expect(reportLayout).toHaveBeenCalledWith(DEFAULT_SIDEBAR_WIDTH_PX, 250, 100 - DEFAULT_REPORTING_PCT, DEFAULT_SPLIT_PCT);
  });

  it('a completed reporting-height drag converts back to tabAreaPct (100 - heightPct)', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));
    reportLayout.mockClear();

    act(() => result.current.setReportingHeightPct(40));

    expect(reportLayout).toHaveBeenCalledWith(DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SIDEBAR_WIDTH_PX, 60, DEFAULT_SPLIT_PCT);
  });

  it('a server-pushed layout event updates state without reporting back (no echo)', () => {
    const { client, emitLayout, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));
    reportLayout.mockClear();

    act(() => emitLayout({ sidebarLeft: 350, splitPct: 63 }));

    expect(result.current.sidebarLeftWidth).toBe(350);
    expect(result.current.splitPct).toBe(63);
    expect(reportLayout).not.toHaveBeenCalled();
  });

  it('reports its initial layout on mount and again when the client reconnects', () => {
    const { client, emitConnectionStatus, reportLayout } = makeClient();
    renderHook(() => useLayoutState(client));

    expect(reportLayout).toHaveBeenNthCalledWith(1, DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SIDEBAR_WIDTH_PX, 100 - DEFAULT_REPORTING_PCT, DEFAULT_SPLIT_PCT);

    act(() => emitConnectionStatus('connected'));

    expect(reportLayout).toHaveBeenNthCalledWith(2, DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SIDEBAR_WIDTH_PX, 100 - DEFAULT_REPORTING_PCT, DEFAULT_SPLIT_PCT);
  });

  it('reports a manual split divider drag with the other held sizes', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));
    reportLayout.mockClear();

    act(() => result.current.setSplitPct(62));

    expect(result.current.splitPct).toBe(62);
    expect(reportLayout).toHaveBeenCalledWith(DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SIDEBAR_WIDTH_PX, 100 - DEFAULT_REPORTING_PCT, 62);
  });
});
