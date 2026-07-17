import type { Tab } from './types.js';
import type { Managers } from './managers.js';

// The schedules tab is a singleton, view-only tab (`view: 'schedules'`) that aggregates every
// scheduled command across all open tabs into one next-to-run-ordered list. It mirrors the
// notifications tab's open-or-reuse, dockable shape, but its body reflects live computed schedule
// state rather than an appended feed, so there is no append path — it is populated by `buildTabView`.

export const SCHEDULES_LABEL = 'schedules';

// The open schedules tab, or undefined when none is open.
export function schedulesTab(managers: Managers): Tab | undefined {
  return managers.tab.tabs.find((t) => t.view === 'schedules');
}

// Open the schedules tab or reuse the existing one, optionally docking it into a sidebar. Called
// only from the `schedules` command. With no `dock`, an existing docked tab is undocked back to the
// center strip and made active (bare `schedules` always makes the list visible).
export function openSchedulesTab(managers: Managers, dock?: 'left' | 'right'): Tab {
  const existing = schedulesTab(managers);
  if (existing) {
    managers.tab.setDock(managers.tab.findIndex(existing.label), dock ?? null);
    return existing;
  }
  managers.tab.openSchedulesTab();
  if (dock) managers.tab.setDock(managers.tab.findIndex(SCHEDULES_LABEL), dock);
  return schedulesTab(managers)!;
}
