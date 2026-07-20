import { useEffect, useState } from 'react';
import type { JanusClient } from './ws';
import { DEFAULT_WIDTH_PX } from './Sidebar';
import { DEFAULT_PCT } from './ReportingSection';

export type LayoutState = {
  sidebarLeftWidth: number;
  setSidebarLeftWidth: (width: number) => void;
  sidebarRightWidth: number;
  setSidebarRightWidth: (width: number) => void;
  reportingHeightPct: number;
  setReportingHeightPct: (heightPct: number) => void;
};

// Sidebar widths and the reporting-section height percentage, hoisted out of Sidebar/
// ReportingSection's own state so a profile's `_layout.json` can drive them too (see
// product/specs/profiles.md's "Profile-level layout" section). A `layout` WS event patches
// whichever of the three fields it carries, leaving the rest untouched. Split out of App.tsx to
// keep it under the file-size limit.
export function useLayoutState(client: JanusClient): LayoutState {
  const [sidebarLeftWidth, setSidebarLeftWidth] = useState(DEFAULT_WIDTH_PX);
  const [sidebarRightWidth, setSidebarRightWidth] = useState(DEFAULT_WIDTH_PX);
  const [reportingHeightPct, setReportingHeightPct] = useState(DEFAULT_PCT);

  useEffect(() => client.onLayout((sidebarLeft, sidebarRight, tabAreaPct) => {
    if (sidebarLeft !== undefined) setSidebarLeftWidth(sidebarLeft);
    if (sidebarRight !== undefined) setSidebarRightWidth(sidebarRight);
    // tabAreaPct is the upper action area's share; ReportingSection's heightPct is the lower
    // reporting area's share, so the two are complementary.
    if (tabAreaPct !== undefined) setReportingHeightPct(100 - tabAreaPct);
  }), [client]);

  return {
    sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth, reportingHeightPct, setReportingHeightPct,
  };
}
