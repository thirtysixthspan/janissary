import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';

type SidebarEntry = { tab: TabView; index: number };

export function useSidebarSelection(
  tabs: TabView[], side: 'left' | 'right', focusView: 'files' | 'notifications' | undefined, client: JanusClient,
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

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const pendingRevealRef = useRef<'left' | 'right' | null>(null);
  const applyRevealRef = useRef<(dock: 'left' | 'right') => void>(() => {});
  applyRevealRef.current = (dock) => {
    if (dock !== side) return;
    const notifications = entriesRef.current.find((entry) => entry.tab.view === 'notifications');
    if (notifications) {
      pendingRevealRef.current = null;
      setSelectedLabel(notifications.tab.label);
    } else {
      pendingRevealRef.current = dock;
    }
  };

  useEffect(() => client.onNotificationsReveal?.((dock) => applyRevealRef.current(dock)), [client]);
  useEffect(() => {
    if (pendingRevealRef.current) applyRevealRef.current(pendingRevealRef.current);
  }, [entries, side]);

  const current = entries.find((entry) => entry.tab.label === selectedLabel) ?? entries[0];
  const activeIndex = current ? entries.indexOf(current) : -1;
  const plugins = entries.filter((entry) => entry.tab.view === 'plugin' && entry.tab.plugin);

  return { entries, selectedLabel, setSelectedLabel, current, activeIndex, plugins };
}
