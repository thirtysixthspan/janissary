import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';

type SidebarEntry = { tab: TabView; index: number };

export function useSidebarSelection(
  tabs: TabView[], side: 'left' | 'right', focusView?: 'files' | 'notifications',
) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const previousLabelsRef = useRef<Set<string>>(new Set());
  const entries = useMemo<SidebarEntry[]>(
    () => tabs.map((tab, index) => ({ tab, index })).filter((entry) => entry.tab.dock === side),
    [side, tabs],
  );

  useEffect(() => {
    const newlyDocked = entries.find((entry) => !previousLabelsRef.current.has(entry.tab.label));
    if (newlyDocked) setSelectedLabel(newlyDocked.tab.label);
    previousLabelsRef.current = new Set(entries.map((entry) => entry.tab.label));
  }, [entries]);

  useEffect(() => {
    const focused = focusView && entries.find((entry) => entry.tab.view === focusView);
    if (focused) setSelectedLabel(focused.tab.label);
  }, [entries, focusView]);

  const current = entries.find((entry) => entry.tab.label === selectedLabel) ?? entries[0];
  const activeIndex = current ? entries.indexOf(current) : -1;
  const plugins = entries.filter((entry) => entry.tab.view === 'plugin' && entry.tab.plugin);

  return { entries, selectedLabel, setSelectedLabel, current, activeIndex, plugins };
}
