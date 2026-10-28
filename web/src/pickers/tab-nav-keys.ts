import type { TabNavEntry } from './tab-nav-match';

export function handleTabNavKey(
  e: KeyboardEvent,
  navTabs: TabNavEntry[],
  navIdx: number,
  setNavIndex: (setter: (prev: number) => number) => void,
  selectNavTab: (index: number) => void,
  setNavOpen: (open: boolean) => void,
  navQuery: string,
  setNavQuery: (query: string) => void,
): boolean {
  if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); setNavOpen(false); return true; }
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key.toLowerCase() === 'p')) {
    e.preventDefault(); setNavIndex((index) => Math.max(0, index - 1)); return true;
  }
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === 'n')) {
    e.preventDefault(); setNavIndex((index) => Math.min(navTabs.length - 1, index + 1)); return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const entry = navTabs[navIdx];
    if (entry) selectNavTab(entry.index);
    setNavOpen(false);
    return true;
  }
  if (e.key === 'Escape') { e.preventDefault(); setNavOpen(false); return true; }
  if (e.key === 'Backspace') { e.preventDefault(); setNavQuery(navQuery.slice(0, -1)); return true; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    setNavQuery(navQuery + e.key);
    setNavIndex(() => 0);
    return true;
  }
  return false;
}
