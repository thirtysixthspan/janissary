import type { StateEvent } from '@shared/protocol';
import { visibleTabs } from '../shared/tab/visible-tabs';

export type AlertPlacement = {
  isVisible(label: string): boolean;
  reveal(label: string): boolean;
};

export type DockedAlertSelection = {
  isSelected(label: string): boolean;
  select(label: string): boolean;
};

export function createAlertPlacement(
  getState: () => StateEvent | undefined, docked: DockedAlertSelection | undefined,
): AlertPlacement {
  const isDocked = (label: string) => Boolean(getState()?.tabs.find((tab) => tab.label === label)?.dock);
  return {
    isVisible(label) {
      if (isDocked(label)) return docked?.isSelected(label) ?? false;
      const state = getState();
      return state !== undefined && visibleTabs(state).visibleLabels.includes(label);
    },
    reveal(label) {
      return isDocked(label) && (docked?.select(label) ?? false);
    },
  };
}
