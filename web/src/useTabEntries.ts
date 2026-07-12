import { useMemo } from 'react';
import type { TabView } from '@shared/protocol';
import { isReportingTab } from './ReportingSection';

// Action tabs (above the command bar, take commands) vs. reporting tabs (below it, report-only).
// Each entry keeps its index in the server's full tab list for RPCs. A tab docked into a sidebar
// leaves the strip entirely (rendered by Sidebar instead) while staying in the server's tab
// array, so RPCs still address it by index. Split out of App.tsx to keep it under the file-size
// limit.
export function useTabEntries(tabs: TabView[]) {
  const actionEntries = useMemo(
    () => tabs.map((tab, index) => ({ tab, index })).filter((e) => !isReportingTab(e.tab) && !e.tab.dock),
    [tabs],
  );
  const reportingEntries = useMemo(
    () => tabs.map((tab, index) => ({ tab, index })).filter((e) => isReportingTab(e.tab)),
    [tabs],
  );
  return { actionEntries, reportingEntries };
}
