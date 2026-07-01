import type { Command, CommandManagers } from './types.js';
import type { ScheduleEntry, Tab } from '../types.js';
import { parseScheduleCommand, formatSchedule } from '../schedule.js';

// Resolve the tab a schedule operation applies to: the issuing tab by default, or the
// `in <tab>` target. Agent and harness tabs can hold schedules; image/page/markdown views
// cannot run commands, so scheduling into them is rejected.
function resolveTargetTab(target: string | undefined, own: string, managers: CommandManagers): Tab | { error: string } {
  const label = target ?? own;
  const tab = managers.tab.tabs.find((t) => t.label === label);
  if (!tab) return { error: `No tab named "${label}".` };
  if (tab.view !== undefined && tab.view !== 'agent' && tab.view !== 'harness') {
    return { error: `Tab "${label}" cannot run scheduled commands.` };
  }
  return tab;
}

// Persist a tab's schedule alongside its agent state. Harness tabs have no persisted agent
// state (they cannot be rehydrated), so their schedules live in memory only.
function persistSchedule(tab: Tab, managers: CommandManagers): void {
  if (tab.view === 'harness') return;
  managers.tab.persist(managers.tab.buildAgentState(tab, { schedule: managers.schedule.get(tab.label) }));
}

export const command: Command = {
  name: 'schedule',
  match: (command_) => /^schedule\b/i.test(command_),
  run: (command_, tab, managers) => {
    const parsed = parseScheduleCommand(command_.replace(/^schedule\b\s*/i, ''), new Date());
    const append = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    if ('error' in parsed) { append(parsed.error); return; }
    const target = resolveTargetTab(parsed.target, tab.label, managers);
    if ('error' in target) { append(target.error); return; }
    const suffix = target.label === tab.label ? '' : ` in ${target.label}`;
    const current = managers.schedule.get(target.label) ?? [];
    if (parsed.action === 'list') { append(formatSchedule(current)); return; }
    let next: ScheduleEntry[];
    let message: string;
    if (parsed.action === 'add') {
      if (current.some((e) => e.id === parsed.name)) { append(`A scheduled command named "${parsed.name}" already exists${suffix}.`); return; }
      const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
      next = [...current, entry];
      message = `Scheduled ${entry.id}${suffix}: ${entry.spec} — ${entry.command}`;
    } else if (parsed.action === 'cancel') {
      next = current.filter((e) => e.id !== parsed.id);
      if (next.length === current.length) { append(`No scheduled command "${parsed.id}"${suffix}.`); return; }
      message = `Cancelled ${parsed.id}${suffix}.`;
    } else {
      if (current.length === 0) { append(`No scheduled commands${suffix}.`); return; }
      next = [];
      message = `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}${suffix}.`;
    }
    managers.schedule.set(target.label, next);
    persistSchedule(target, managers);
    append(message);
  },
};
