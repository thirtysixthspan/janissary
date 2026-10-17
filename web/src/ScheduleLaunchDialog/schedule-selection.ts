import type { ScheduleLaunchView } from '@shared/protocol';
import type { ScheduleFields, ScheduleTarget } from './schedule-command';

export function initialScheduleTarget(view: ScheduleLaunchView): ScheduleTarget {
  if (view.active === 'system') return { kind: 'system' };
  if (view.targets.includes(view.active)) return { kind: 'tab', label: view.active };
  const first = view.targets[0];
  return first ? { kind: 'tab', label: first } : { kind: 'system' };
}

export function reconcileScheduleTarget(target: ScheduleTarget, view: ScheduleLaunchView): ScheduleTarget {
  if (target.kind === 'system') return target;
  if (view.targets.includes(target.label)) return target;
  return initialScheduleTarget(view);
}

export function reconcileRunscript(script: string, view: ScheduleLaunchView): string {
  return view.runscripts.includes(script) ? script : '';
}

export function reconcileScheduleFields(fields: ScheduleFields, view: ScheduleLaunchView): ScheduleFields {
  return {
    ...fields,
    target: reconcileScheduleTarget(fields.target, view),
    activeTarget: view.active,
    script: reconcileRunscript(fields.script, view),
  };
}
