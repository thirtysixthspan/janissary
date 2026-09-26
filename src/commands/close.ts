import { resolveTarget } from './resolve-target.js';
import type { Command } from './types.js';
import { isCloseCommand, parseClose } from './parse-close.js';

export const command: Command = {
  name: 'close',
  match: isCloseCommand,
  samples: ['close', 'exit', 'close notes'],
  run: (command_, tab, managers) => {
    const parsed = parseClose(command_);
    if ('error' in parsed) { managers.tab.append(tab.label, { input: command_, output: parsed.error }); return; }
    if (parsed.target === 'tabname') {
      const target = resolveTarget(parsed.name, managers, (output) => managers.tab.append(tab.label, { input: command_, output }));
      if (!target) return;
      managers.tab.closeTab(managers.tab.findIndex(target.label));
    } else {
      managers.tab.closeTab(tab.index);
    }
  },
};
