import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';

export const command: Command = {
  name: 'rename',
  match: (command_) => /^rename\b/i.test(command_),
  samples: ['rename', 'rename notes'],
  run: (command_, tab, managers, invocation) => {
    const rest = command_.replace(/^rename\b\s*/i, '').trim();
    const refusal = managers.tab.renameTab(tab.index, rest);
    const output = refusal ?? (rest
      ? `Tab "${tab.label}" now displays as "${rest}" (routing still uses "${tab.label}").`
      : `Tab "${tab.label}" alias cleared.`);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
