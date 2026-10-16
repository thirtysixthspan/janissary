import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import { notify } from '../../notifications/index.js';
import {
  notifySystemScheduleMissingScript,
  notifySystemScheduleMissedRun,
  notifySystemScheduleRun,
  notifySystemShellStartFailure,
} from './notices.js';

vi.mock('../../notifications/index.js', () => ({ notify: vi.fn() }));

const managers = {} as Managers;

beforeEach(() => {
  vi.mocked(notify).mockClear();
});

function expectSystemScheduleNotice(message: string): void {
  expect(notify).toHaveBeenCalledWith(managers, 'system-schedule-fire', 'system', message, { openTab: 'system' });
}

describe('system schedule notices', () => {
  it('reports the queued runscript invocation', () => {
    notifySystemScheduleRun(managers, 'nightly', 'deploy');

    expectSystemScheduleNotice('System schedule nightly ran: script deploy');
  });

  it('formats the missed scheduled time with the schedule display format', () => {
    notifySystemScheduleMissedRun(managers, 'weekly', new Date(2026, 3, 12, 8, 5).getTime());

    expectSystemScheduleNotice('System schedule weekly missed its run at Apr 12 8:05am; not run (app was closed).');
  });

  it('names the missing project runscript file', () => {
    notifySystemScheduleMissingScript(managers, 'nightly', 'deploy');

    expectSystemScheduleNotice('System schedule nightly could not run: script ".janissary/scripts/deploy.rs" is missing.');
  });

  it('normalizes a shell-start failure to one line and one final period', () => {
    notifySystemShellStartFailure(managers, new Error('spawn denied!\nsecond line'));

    expectSystemScheduleNotice('System shell could not start: spawn denied.');
  });
});
