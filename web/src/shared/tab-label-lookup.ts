// The label of the tab whose body encloses `target`: the nearest `[data-tab-label]` ancestor-or-self.
export function enclosingTabLabel(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>('[data-tab-label]')?.dataset.tabLabel;
}
