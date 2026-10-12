import type { Command } from './types.js';
import { notify } from '../notifications/index.js';
import { appendCommandOutput } from '../command/append.js';

// `notify <message>` pushes a custom line into the notifications feed, attributed to the issuing
// tab. It is the deliberate counterpart to the four ambient events: an explicit signal that
// bypasses focus suppression and the per-event toggles (an agent that calls `notify` always means
// to signal, even from the focused tab). It never opens the tab — if the feed is closed the
// message is dropped (drop-if-closed). Available from any tab, agents included. `notify` with no
// message is a usage error and records nothing in the feed.
export const command: Command = {
  name: 'notify',
  match: (command_) => /^notify\b/i.test(command_),
  samples: ['notify', 'notify hello'],
  run: (command_, tab, managers, invocation) => {
    const message = command_.replace(/^notify\b\s*/i, '').trim();
    appendCommandOutput(managers, tab.label, { input: command_, output: '' }, invocation);
    if (!message) {
      appendCommandOutput(managers, tab.label, { input: '', output: 'Usage: notify <message>.' }, invocation);
      return;
    }
    notify(managers, 'manual', tab.label, message);
  },
};
