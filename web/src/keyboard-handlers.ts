import type { RouteChooserView } from '@shared/protocol';
import type { TabNavEntry } from './TabNavPicker';

export function handleRouteChooserKey(
  e: KeyboardEvent,
  route: RouteChooserView,
  routeIdx: number,
  setRouteIndex: (setter: (prev: number) => number) => void,
  chooseRoute: (index: number) => void,
): boolean {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); setRouteIndex((index) => Math.max(0, index - 1)); return true; }
  case 'ArrowDown': { e.preventDefault(); setRouteIndex((index) => Math.min(route.choices.length - 1, index + 1)); return true; }
  case 'Enter': { e.preventDefault(); chooseRoute(routeIdx); return true; }
  case 'Escape': { e.preventDefault(); chooseRoute(-1); return true; }
  }
  return false;
}

export function handlePickerKey(
  e: KeyboardEvent,
  items: string[],
  pickerIdx: number,
  setPickerIndex: (setter: (prev: number) => number) => void,
  runCommand: (cmd: string) => void,
  setPickerOpen: (open: boolean) => void,
): boolean {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); setPickerIndex((index) => Math.max(0, index - 1)); return true; }
  case 'ArrowDown': { e.preventDefault(); setPickerIndex((index) => Math.min(items.length - 1, index + 1)); return true; }
  case 'Enter': { e.preventDefault(); const command = items[pickerIdx]; if (command) runCommand(command); setPickerOpen(false); return true; }
  case 'Escape': { e.preventDefault(); setPickerOpen(false); return true; }
  }
  return false;
}

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
