import type { Managers } from '../../managers.js';
import { errorFirstLine } from '../../error-text.js';
import { notify } from '../../notifications/index.js';
import { fmtNextRun } from '../display.js';

function notifySystemScheduleNotice(managers: Managers, message: string): void {
  notify(managers, 'system-schedule-fire', 'system', message, { openTab: 'system' });
}

export function notifySystemScheduleRun(managers: Managers, scheduleId: string, runscriptName: string): void {
  notifySystemScheduleNotice(managers, `System schedule ${scheduleId} ran: script ${runscriptName}`);
}

export function notifySystemScheduleMissedRun(managers: Managers, scheduleId: string, nextRun: number): void {
  const time = fmtNextRun(nextRun);
  notifySystemScheduleNotice(managers, `System schedule ${scheduleId} missed its run at ${time}; not run (app was closed).`);
}

export function notifySystemScheduleMissingScript(
  managers: Managers,
  scheduleId: string,
  runscriptName: string,
): void {
  const file = `.janissary/scripts/${runscriptName}.rs`;
  notifySystemScheduleNotice(managers, `System schedule ${scheduleId} could not run: script "${file}" is missing.`);
}

export function notifySystemShellStartFailure(managers: Managers, reason: unknown): void {
  const summary = errorFirstLine(reason);
  notifySystemScheduleNotice(managers, `System shell could not start: ${summary}.`);
}
