import type { TabView } from '@shared/protocol';

// The label of the first tab, in the server's tab-strip order, that has unsaved changes and has not
// been answered in this walk. The answered set is the only progress: a tab that closed or reads
// clean is skipped from the live inputs, and a tab that becomes dirty later is returned even when
// it sits before one already answered.
export function nextWalkLabel(
  tabs: readonly TabView[],
  isDirty: (label: string) => boolean,
  answered: ReadonlySet<string>,
): string | undefined {
  return tabs.find((tab) => isDirty(tab.label) && !answered.has(tab.label))?.label;
}

// The quit walk's per-tab prompt: the single-tab close dialog's sentence frame with the tab's full
// name in place of "this file". The name is used verbatim, including an empty one.
export function walkTitle(name: string): string {
  return `Do you want to save changes to ${name}?`;
}
