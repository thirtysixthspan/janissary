import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from './ws';
import { useLayoutState } from './useLayoutState';
import { DEFAULT_WIDTH_PX } from './Sidebar';
import { DEFAULT_PCT } from './ReportingSection';

type LayoutEvent = {
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  focusLeft?: 'files' | 'notifications' | 'schedules';
  focusRight?: 'files' | 'notifications' | 'schedules';
};

function makeClient() {
  let listener: ((event: LayoutEvent) => void) | null = null;
  const reportLayout = vi.fn();
  const client = {
    onLayout: (l: (event: LayoutEvent) => void) => { listener = l; return () => {}; },
    reportLayout,
  } as unknown as JanusClient;
  return { client, emitLayout: (event: LayoutEvent) => listener?.(event), reportLayout };
}

describe('useLayoutState', () => {
  it('a completed sidebar-left drag reports the new sizes to the server', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));

    act(() => result.current.setSidebarLeftWidth(400));

    expect(result.current.sidebarLeftWidth).toBe(400);
    expect(reportLayout).toHaveBeenCalledWith(400, DEFAULT_WIDTH_PX, 100 - DEFAULT_PCT);
  });

  it('a completed sidebar-right drag reports the new sizes to the server', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));

    act(() => result.current.setSidebarRightWidth(250));

    expect(reportLayout).toHaveBeenCalledWith(DEFAULT_WIDTH_PX, 250, 100 - DEFAULT_PCT);
  });

  it('a completed reporting-height drag converts back to tabAreaPct (100 - heightPct)', () => {
    const { client, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));

    act(() => result.current.setReportingHeightPct(40));

    expect(reportLayout).toHaveBeenCalledWith(DEFAULT_WIDTH_PX, DEFAULT_WIDTH_PX, 60);
  });

  it('a server-pushed layout event updates state without reporting back (no echo)', () => {
    const { client, emitLayout, reportLayout } = makeClient();
    const { result } = renderHook(() => useLayoutState(client));

    act(() => emitLayout({ sidebarLeft: 350 }));

    expect(result.current.sidebarLeftWidth).toBe(350);
    expect(reportLayout).not.toHaveBeenCalled();
  });
});
