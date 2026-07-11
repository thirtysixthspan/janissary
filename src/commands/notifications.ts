import type { Command } from './types.js';
import { openNotificationsTab } from '../notifications-tab.js';

// `notifications` opens (or focuses) the singleton notifications tab. `notifications left` /
// `notifications right` dock it into that sidebar, mirroring `files [left|right]`. Bare
// `notifications` on a docked tab undocks it back to center and makes it active. The tab is a
// singleton — a second invocation reuses the existing one.
export const command: Command = {
  name: 'notifications',
  match: (command_) => /^notifications\b/i.test(command_),
  run: (command_, tab, managers) => {
    managers.tab.append(tab.label, { input: command_, output: '' });
    const rest = command_.replace(/^notifications\b\s*/i, '');
    const keyword = /^(left|right)\b/i.exec(rest);
    const dock = keyword ? (keyword[1].toLowerCase() as 'left' | 'right') : undefined;
    openNotificationsTab(managers, dock);
  },
};
