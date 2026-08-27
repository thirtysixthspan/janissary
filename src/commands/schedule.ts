import type { Command, CommandManagers } from './types.js';
import type { ScheduleEntry, ScheduleParseResult } from '../schedule/types.js';
import type { Tab } from '../tab/types.js';
import { parseScheduleCommand, formatSchedule } from '../schedule/index.js';

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

function scheduleChange(parsed: Exclude<ScheduleParseResult, { error: string }>, current: ScheduleEntry[], suffix: string) {
  if (parsed.action === 'list') return { message: formatSchedule(current) };
  if (parsed.action === 'add') {
    if (current.some((entry) => entry.id === parsed.name)) return { message: `A scheduled command named "${parsed.name}" already exists${suffix}.` };
    const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
    return { next: [...current, entry], message: `Scheduled ${entry.id}${suffix}: ${entry.spec} — ${entry.command}` };
  }
  if (parsed.action === 'cancel') {
    const next = current.filter((entry) => entry.id !== parsed.id);
    if (next.length === current.length) return { message: `No scheduled command "${parsed.id}"${suffix}.` };
    return { next, message: `Cancelled ${parsed.id}${suffix}.` };
  }
  if (current.length === 0) return { message: `No scheduled commands${suffix}.` };
  return { next: [], message: `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}${suffix}.` };
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
    const { next, message } = scheduleChange(parsed, current, suffix);
    if (!next) { append(message); return; }
    managers.schedule.set(target.label, next); persistSchedule(target, managers);
    append(message);
  },
};
