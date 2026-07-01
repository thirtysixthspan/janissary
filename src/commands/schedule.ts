import type { Command } from './types.js';
import type { ScheduleEntry } from '../types.js';
import { parseScheduleCommand, formatSchedule } from '../schedule.js';

export const command: Command = {
  name: 'schedule',
  match: (command_) => /^schedule\b/i.test(command_),
  run: (command_, tab, managers) => {
    const parsed = parseScheduleCommand(command_.replace(/^schedule\b\s*/i, ''), new Date());
    const append = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    if ('error' in parsed) { append(parsed.error); return; }
    const current = managers.schedule.get(tab.label) ?? [];
    if (parsed.action === 'list') { append(formatSchedule(current)); return; }
    let next: ScheduleEntry[];
    let message: string;
    if (parsed.action === 'add') {
      if (current.some((e) => e.id === parsed.name)) { append(`A scheduled command named "${parsed.name}" already exists.`); return; }
      const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
      next = [...current, entry];
      message = `Scheduled ${entry.id}: ${entry.spec} — ${entry.command}`;
    } else if (parsed.action === 'cancel') {
      next = current.filter((e) => e.id !== parsed.id);
      if (next.length === current.length) { append(`No scheduled command "${parsed.id}".`); return; }
      message = `Cancelled ${parsed.id}.`;
    } else {
      if (current.length === 0) { append('No scheduled commands.'); return; }
      next = [];
      message = `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}.`;
    }
    managers.schedule.set(tab.label, next);
    const scheduleTab = managers.tab.tabs.find((t) => t.label === tab.label);
    if (scheduleTab) managers.tab.persist(managers.tab.buildAgentState(scheduleTab, { schedule: managers.schedule.get(scheduleTab.label) }));
    append(message);
  },
};
