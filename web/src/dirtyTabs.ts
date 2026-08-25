import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from './tab-handles';

// True when any open tab with a registered dirty handle has unsaved changes. Editor tabs register
// one from their own ref; a plugin tab registers one through its client capabilities, so an image
// tab with an unsaved crop answers here exactly as an unsaved buffer does.
//
// Used to gate whole-app close paths (`quit`, closing the last tab, the browser/OS window itself)
// that don't go through a single tab's `closeTab` — and therefore never hit CloseSaveGuard's per-tab
// dirty check. The map is the only membership test: a tab with nothing registered reads clean.
export function anyDirtyTab(tabs: TabView[], tabHandles: React.RefObject<Map<string, DirtyTabHandle>>): boolean {
  return tabs.some((tab) => tabHandles.current.get(tab.label)?.isDirty());
}
