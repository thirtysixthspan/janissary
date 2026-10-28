import { useEffect, useRef, useState } from 'react';
import type { JanusClient } from './shared/ws/ws';
import { DEFAULT_REPORTING_PCT, DEFAULT_SIDEBAR_WIDTH_PX, DEFAULT_SPLIT_PCT } from './layout-defaults';

type DockedView = 'files' | 'notifications';

export type LayoutState = {
  sidebarLeftWidth: number;
  setSidebarLeftWidth: (width: number) => void;
  sidebarRightWidth: number;
  setSidebarRightWidth: (width: number) => void;
  reportingHeightPct: number;
  setReportingHeightPct: (heightPct: number) => void;
  splitPct: number;
  setSplitPct: (splitPct: number) => void;
  focusLeft?: DockedView;
  focusRight?: DockedView;
};

// Sidebar widths, the reporting-section height percentage, the center split, and which docked tab
// should be visible per side, hoisted so server layout updates can drive them (see the `layout`
// command in product/specs/application-commands.md). A `layout` WS event patches
// whichever fields it carries, leaving the rest untouched. Split out of App.tsx to keep it under
// the file-size limit.
export function useLayoutState(client: JanusClient): LayoutState {
  const [sidebarLeftWidth, setSidebarLeftWidth] = useState(DEFAULT_SIDEBAR_WIDTH_PX);
  const [sidebarRightWidth, setSidebarRightWidth] = useState(DEFAULT_SIDEBAR_WIDTH_PX);
  const [reportingHeightPct, setReportingHeightPct] = useState(DEFAULT_REPORTING_PCT);
  const [splitPct, setSplitPct] = useState(DEFAULT_SPLIT_PCT);
  const [focusLeft, setFocusLeft] = useState<DockedView | undefined>(undefined);
  const [focusRight, setFocusRight] = useState<DockedView | undefined>(undefined);
  const layoutRef = useRef({ sidebarLeftWidth, sidebarRightWidth, reportingHeightPct, splitPct });
  layoutRef.current = { sidebarLeftWidth, sidebarRightWidth, reportingHeightPct, splitPct };

  useEffect(() => client.onLayout((event) => {
    if (event.sidebarLeft !== undefined) setSidebarLeftWidth(event.sidebarLeft);
    if (event.sidebarRight !== undefined) setSidebarRightWidth(event.sidebarRight);
    // tabAreaPct is the upper action area's share; ReportingSection's heightPct is the lower
    // reporting area's share, so the two are complementary.
    if (event.tabAreaPct !== undefined) setReportingHeightPct(100 - event.tabAreaPct);
    if (event.splitPct !== undefined) setSplitPct(event.splitPct);
    if (event.focusLeft !== undefined) setFocusLeft(event.focusLeft);
    if (event.focusRight !== undefined) setFocusRight(event.focusRight);
  }), [client]);

  useEffect(() => {
    const report = () => {
      const layout = layoutRef.current;
      client.reportLayout(
        layout.sidebarLeftWidth,
        layout.sidebarRightWidth,
        100 - layout.reportingHeightPct,
        layout.splitPct,
      );
    };
    const unsubscribe = client.onConnectionStatus((phase) => {
      if (phase === 'connected') report();
    });
    report();
    return unsubscribe;
  }, [client]);

  // Report a manual resize back to the server (the reverse of the `layout` event above), so
  // bare `layout` can read the live sizes. Not fired for server-driven updates (the setters
  // above, called from onLayout, bypass these wrappers).
  const reportSidebarLeftWidth = (width: number) => {
    setSidebarLeftWidth(width);
    client.reportLayout(width, sidebarRightWidth, 100 - reportingHeightPct, splitPct);
  };
  const reportSidebarRightWidth = (width: number) => {
    setSidebarRightWidth(width);
    client.reportLayout(sidebarLeftWidth, width, 100 - reportingHeightPct, splitPct);
  };
  const reportReportingHeightPct = (heightPct: number) => {
    setReportingHeightPct(heightPct);
    client.reportLayout(sidebarLeftWidth, sidebarRightWidth, 100 - heightPct, splitPct);
  };
  const reportSplitPct = (nextSplitPct: number) => {
    setSplitPct(nextSplitPct);
    client.reportLayout(sidebarLeftWidth, sidebarRightWidth, 100 - reportingHeightPct, nextSplitPct);
  };

  return {
    sidebarLeftWidth, setSidebarLeftWidth: reportSidebarLeftWidth,
    sidebarRightWidth, setSidebarRightWidth: reportSidebarRightWidth,
    reportingHeightPct, setReportingHeightPct: reportReportingHeightPct,
    splitPct, setSplitPct: reportSplitPct,
    focusLeft, focusRight,
  };
}
