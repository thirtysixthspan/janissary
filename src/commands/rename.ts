import type { Command } from './types.js';

export const command: Command = {
  name: 'rename',
  match: (command_) => /^rename\b/i.test(command_),
  run: (command_, tab, managers) => {
    const rest = command_.replace(/^rename\b\s*/i, '').trim();
    managers.tab.renameTab(tab.index, rest);
    const output = rest
      ? `Tab "${tab.label}" now displays as "${rest}" (msg/routing still use "${tab.label}").`
      : `Tab "${tab.label}" alias cleared.`;
    managers.tab.append(tab.label, { input: command_, output });
  },
};
