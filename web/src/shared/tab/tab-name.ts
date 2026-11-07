import type { TabView } from '@shared/protocol';

// The tab strip's full name: the editor's file name when the tab carries an editor, otherwise the
// title, otherwise the label. Nullish, not truthy — an empty string is returned as-is.
export function tabFullName(tab: TabView): string {
  return tab.editor?.name ?? tab.title ?? tab.label;
}
