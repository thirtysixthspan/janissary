import type { Command } from './types.js';
import type { ScheduleEntry } from '../types.js';
import { loadAgentState, saveAgentState } from '../agent-state.js';
import { parseScheduleCommand, formatSchedule } from '../schedule.js';

export const command: Command = {
  name: 'schedule',
  match: (cmd) => /^schedule\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { tabs, activeTab, updateCurrentTab, setAgentStates } = ctx;
    const label = tabs[activeTab]?.label;
    const rest = cmd.replace(/^schedule\b\s*/i, '');
    const parsed = parseScheduleCommand(rest, new Date());
    const out = (text: string) =>
      updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: cmd, output: text }], scrollOffset: 0 }));

    if ('error' in parsed) {
      out(parsed.error);
      return;
    }

    const current = loadAgentState(label)?.schedule ?? [];

    if (parsed.action === 'list') {
      out(formatSchedule(current));
      return;
    }

    let next: ScheduleEntry[];
    let message: string;
    if (parsed.action === 'add') {
      if (current.some((e) => e.id === parsed.name)) {
        out(`A scheduled command named "${parsed.name}" already exists.`);
        return;
      }
      const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
      next = [...current, entry];
      message = `Scheduled ${entry.id}: ${entry.spec} — ${entry.command}`;
    } else if (parsed.action === 'cancel') {
      next = current.filter((e) => e.id !== parsed.id);
      if (next.length === current.length) {
        out(`No scheduled command "${parsed.id}".`);
        return;
      }
      message = `Cancelled ${parsed.id}.`;
    } else {
      if (!current.length) {
        out('No scheduled commands.');
        return;
      }
      next = [];
      message = `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}.`;
    }

    setAgentStates((prev) => {
      const cur = prev[label];
      if (!cur) return prev;
      const updated = { ...cur, schedule: next };
      try { saveAgentState(updated); } catch { /* ignore */ }
      return { ...prev, [label]: updated };
    });
    out(message);
  },
};
