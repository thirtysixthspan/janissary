import type { Command } from './types.js';
import type { ScheduleEntry } from '../types.js';
import { parseScheduleCommand, formatSchedule } from '../schedule.js';

export const command: Command = {
  name: 'schedule',
  match: (command_) => /^schedule\b/i.test(command_),
  run: (command_, context) => {
    const parsed = parseScheduleCommand(command_.replace(/^schedule\b\s*/i, ''), new Date());
    if ('error' in parsed) { context.out(parsed.error); return; }
    const current = context.getSchedule();
    if (parsed.action === 'list') { context.out(formatSchedule(current)); return; }
    let next: ScheduleEntry[];
    let message: string;
    if (parsed.action === 'add') {
      if (current.some((e) => e.id === parsed.name)) { context.out(`A scheduled command named "${parsed.name}" already exists.`); return; }
      const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
      next = [...current, entry];
      message = `Scheduled ${entry.id}: ${entry.spec} — ${entry.command}`;
    } else if (parsed.action === 'cancel') {
      next = current.filter((e) => e.id !== parsed.id);
      if (next.length === current.length) { context.out(`No scheduled command "${parsed.id}".`); return; }
      message = `Cancelled ${parsed.id}.`;
    } else {
      if (current.length === 0) { context.out('No scheduled commands.'); return; }
      next = [];
      message = `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}.`;
    }
    context.setSchedule(next);
    context.out(message);
  },
};
