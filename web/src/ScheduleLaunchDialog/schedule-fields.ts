import type { ScheduleLaunchView } from '@shared/protocol';
import type { ScheduleFields, ScheduleTarget } from './schedule-command';
import { initialScheduleTarget } from './schedule-selection';

export function initialFields(view: ScheduleLaunchView): ScheduleFields {
  return {
    name: '', target: initialScheduleTarget(view), activeTarget: view.active, command: '', script: '',
    type: 'at', time: '', date: '', interval: '', weekday: 'monday',
  };
}

export function selectTarget(value: string): ScheduleTarget {
  return value === 'system'
    ? { kind: 'system' }
    : { kind: 'tab', label: value.slice('tab:'.length) };
}
