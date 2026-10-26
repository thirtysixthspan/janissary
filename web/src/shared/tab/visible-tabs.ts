import type { TabView } from '@shared/protocol';
import { isCenterActionTab } from '@shared/tab/placement';

export type VisibleTabsState = {
  tabs: TabView[];
  activeTab: number;
  secondaryTab?: number;
};

export type VisibleTabs = {
  current?: TabView;
  secondary?: TabView;
  visibleLabels: string[];
};

export function visibleTabs(state: VisibleTabsState): VisibleTabs {
  const selected = state.tabs[state.activeTab];
  const current = selected && !selected.hidden && !selected.dock ? selected : undefined;
  const candidate = state.secondaryTab === undefined || state.secondaryTab < 0
    ? undefined
    : state.tabs[state.secondaryTab];
  const secondary = current && candidate && isCenterActionTab(candidate) ? candidate : undefined;
  return {
    current,
    secondary,
    visibleLabels: current ? [current.label, ...(secondary ? [secondary.label] : [])] : [],
  };
}
