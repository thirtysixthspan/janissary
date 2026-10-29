import type { Managers } from '../managers.js';
import type { TabPluginTopicAction } from './api.js';

type ScheduleAction = Extract<TabPluginTopicAction, { topic: 'schedules' }>;

export function scheduleTopicAction(managers: Managers, action: TabPluginTopicAction): string | undefined {
  if (action.topic !== 'schedules') return;
  switch (action.action) {
    case 'cancel': {
      const authorized = managers.schedule.aggregatedView().some((candidate) => candidate.tab === action.tab
        && candidate.id === action.id
        && (action.owner === 'system'
          ? candidate.owner === 'system' && candidate.key === action.key
          : candidate.owner !== 'system'));
      if (!authorized) return;
      if (action.owner === 'system') return cancelSystemSchedule(managers, action.key, action.id);
      managers.schedule.cancel(action.tab, action.id);
      return;
    }
    case 'clear': {
      if (action.owner === 'tab') {
        managers.schedule.clearAll();
        return;
      }
      const systemResult = managers.systemSchedule.clear();
      return systemResult.ok ? undefined : systemResult.error;
    }
    case 'focusOwner': {
      focusScheduleOwner(managers, action);
      return;
    }
  }
}

function cancelSystemSchedule(managers: Managers, key: string, id: string): string | undefined {
  if (managers.systemSchedule.list().every((entry) => entry.key !== key || entry.id !== id)) return;
  const result = managers.systemSchedule.cancelByKey(key);
  return result.ok ? undefined : result.error;
}

function focusScheduleOwner(
  managers: Managers,
  action: Extract<ScheduleAction, { action: 'focusOwner' }>,
): void {
  const rows = managers.schedule.aggregatedView();
  if (action.owner === 'system') {
    if (action.tab !== 'system' || rows.every((row) => row.owner !== 'system' || row.key !== action.key)) return;
    void managers.systemShell.ensure().then((result) => {
      if (result.status !== 'ok') return;
      const index = managers.tab.findIndex(result.tab.label);
      if (index !== -1) managers.tab.setActiveTab(index);
    });
    return;
  }
  if (rows.every((row) => row.tab !== action.tab || row.owner === 'system')) return;
  const index = managers.tab.findIndex(action.tab);
  if (index !== -1) managers.tab.setActiveTab(index);
}
