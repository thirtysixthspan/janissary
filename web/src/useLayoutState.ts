import { useEffect, useState } from 'react';
import type { JanusClient } from './ws';
import { DEFAULT_WIDTH_PX } from './Sidebar';
import { DEFAULT_PCT } from './ReportingSection';

type DockedView = 'files' | 'notifications' | 'schedules';

export type LayoutState = {
  sidebarLeftWidth: number;
  setSidebarLeftWidth: (width: number) => void;
  sidebarRightWidth: number;
  setSidebarRightWidth: (width: number) => void;
  reportingHeightPct: number;
  setReportingHeightPct: (heightPct: number) => void;
  focusLeft?: DockedView;
  focusRight?: DockedView;
};

// Sidebar widths, the reporting-section height percentage, and which docked tab should be visible
// per side, hoisted out of Sidebar/ReportingSection's own state so a profile's `_layout.json` (and,
// for focus, `_notifications.json`'s `focus` field) can drive them too (see
// product/specs/profiles.md's "Profile-level layout" section). A `layout` WS event patches
// whichever fields it carries, leaving the rest untouched. Split out of App.tsx to keep it under
// the file-size limit.
export function useLayoutState(client: JanusClient): LayoutState {
  const [sidebarLeftWidth, setSidebarLeftWidth] = useState(DEFAULT_WIDTH_PX);
  const [sidebarRightWidth, setSidebarRightWidth] = useState(DEFAULT_WIDTH_PX);
  const [reportingHeightPct, setReportingHeightPct] = useState(DEFAULT_PCT);
  const [focusLeft, setFocusLeft] = useState<DockedView | undefined>(undefined);
  const [focusRight, setFocusRight] = useState<DockedView | undefined>(undefined);

  useEffect(() => client.onLayout((event) => {
    if (event.sidebarLeft !== undefined) setSidebarLeftWidth(event.sidebarLeft);
    if (event.sidebarRight !== undefined) setSidebarRightWidth(event.sidebarRight);
    // tabAreaPct is the upper action area's share; ReportingSection's heightPct is the lower
    // reporting area's share, so the two are complementary.
    if (event.tabAreaPct !== undefined) setReportingHeightPct(100 - event.tabAreaPct);
    if (event.focusLeft !== undefined) setFocusLeft(event.focusLeft);
    if (event.focusRight !== undefined) setFocusRight(event.focusRight);
  }), [client]);

  // Report a manual resize back to the server (the reverse of the `layout` event above), so
  // `profile save` can read the live sizes. Not fired for server-driven updates (the setters
  // above, called from onLayout, bypass these wrappers).
  const reportSidebarLeftWidth = (width: number) => {
    setSidebarLeftWidth(width);
    client.reportLayout(width, sidebarRightWidth, 100 - reportingHeightPct);
  };
  const reportSidebarRightWidth = (width: number) => {
    setSidebarRightWidth(width);
    client.reportLayout(sidebarLeftWidth, width, 100 - reportingHeightPct);
  };
  const reportReportingHeightPct = (heightPct: number) => {
    setReportingHeightPct(heightPct);
    client.reportLayout(sidebarLeftWidth, sidebarRightWidth, 100 - heightPct);
  };

  return {
    sidebarLeftWidth, setSidebarLeftWidth: reportSidebarLeftWidth,
    sidebarRightWidth, setSidebarRightWidth: reportSidebarRightWidth,
    reportingHeightPct, setReportingHeightPct: reportReportingHeightPct,
    focusLeft, focusRight,
  };
}
