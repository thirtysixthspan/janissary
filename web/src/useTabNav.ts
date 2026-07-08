import { useCallback, useMemo, useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { filterTabs } from './TabNavPicker';

// State and handlers for the Ctrl+G / `nav` tab-navigator picker (mirrors the `hist` picker's
// shape in App, split out to keep App.tsx under the file-size limit).
export function useTabNav(client: JanusClient, tabs: TabView[]) {
  const [navOpen, setNavOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const [navIndex, setNavIndex] = useState(0);
  const navTabs = useMemo(() => filterTabs(tabs, navQuery), [tabs, navQuery]);

  const openTabNav = () => { setNavQuery(''); setNavIndex(0); setNavOpen(true); };
  // Used by the `nav <query>` command line, which seeds the filter with whatever followed `nav `.
  const openTabNavWithQuery = (query: string) => { setNavQuery(query); setNavIndex(0); setNavOpen(true); };
  const selectNavTab = useCallback((index: number) => {
    client.send({ method: 'setActiveTab', params: { index } });
    setNavOpen(false);
  }, [client]);

  return {
    navOpen, navQuery, navIndex, navTabs,
    setNavIndex, setNavQuery, setNavOpen, openTabNav, openTabNavWithQuery, selectNavTab,
  };
}
