import type { Command } from './types.js';
import { openNotificationsTab } from '../notifications/tab.js';
import { clearNotifications } from '../notifications/deliver.js';

// `notifications` opens (or focuses) the singleton notifications tab. `notifications left` /
// `notifications right` dock it into that sidebar, mirroring `files [left|right]`. Bare
// `notifications` on a docked tab undocks it back to center and makes it active. The tab is a
// singleton — a second invocation reuses the existing one.
//
// `notifications clear` empties the queue, the record file, and any toasts on screen, and opens and
// moves nothing. It is exclusive with a dock keyword — the command keeps its single-keyword parse,
// and `clear` names an action rather than a placement — so `notifications right clear` is read as
// `notifications right`.
export const command: Command = {
  name: 'notifications',
  match: (command_) => /^notifications\b/i.test(command_),
  samples: ['notifications'],
  run: (command_, tab, managers) => {
    managers.tab.append(tab.label, { input: command_, output: '' });
    const rest = command_.replace(/^notifications\b\s*/i, '');
    const keyword = /^(left|right|clear)\b/i.exec(rest)?.[1].toLowerCase();
    if (keyword === 'clear') { clearNotifications(managers); return; }
    openNotificationsTab(managers, keyword as 'left' | 'right' | undefined);
  },
};
