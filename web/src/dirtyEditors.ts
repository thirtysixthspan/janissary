import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { EditorTabHandle } from './EditorTab';

// True when any open editor tab has unsaved changes. Used to gate whole-app close paths (`quit`,
// closing the last tab, the browser/OS window itself) that don't go through a single tab's
// `closeTab` — and therefore never hit CloseSaveGuard's per-tab dirty check.
export function anyDirtyEditor(tabs: TabView[], editorHandles: React.RefObject<Map<string, EditorTabHandle>>): boolean {
  return tabs.some((tab) => tab.editor && editorHandles.current.get(tab.label)?.isDirty());
}
