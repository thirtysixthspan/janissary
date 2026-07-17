import type { Command } from './types.js';
import { openSchedulesTab } from '../schedules-tab.js';

// `schedules` opens (or focuses) the singleton schedules tab — the aggregated, next-to-run-ordered
// list of every scheduled command across all tabs. `schedules left` / `schedules right` dock it into
// that sidebar, mirroring `notifications [left|right]`. Bare `schedules` on a docked tab undocks it
// back to center and makes it active. The tab is a singleton — a second invocation reuses it. This is
// distinct from the singular `schedule` command, which creates and manages a tab's own timers.
export const command: Command = {
  name: 'schedules',
  match: (command_) => /^schedules\b/i.test(command_),
  run: (command_, tab, managers) => {
    managers.tab.append(tab.label, { input: command_, output: '' });
    const rest = command_.replace(/^schedules\b\s*/i, '');
    const keyword = /^(left|right)\b/i.exec(rest);
    const dock = keyword ? (keyword[1].toLowerCase() as 'left' | 'right') : undefined;
    openSchedulesTab(managers, dock);
  },
};
