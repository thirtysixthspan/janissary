import { resolveTarget } from './resolve-target.js';
import type { Command } from './types.js';
import { isCloseCommand, parseClose } from './parse-close.js';
import { appendCommandOutput } from '../command/append.js';

export const command: Command = {
  name: 'close',
  match: isCloseCommand,
  samples: ['close', 'exit', 'close notes'],
  run: (command_, tab, managers, invocation) => {
    const parsed = parseClose(command_);
    if ('error' in parsed) { appendCommandOutput(managers, tab.label, { input: command_, output: parsed.error }, invocation); return; }
    if (parsed.target === 'tabname') {
      const target = resolveTarget(parsed.name, managers, (output) => appendCommandOutput(managers, tab.label, { input: command_, output }, invocation));
      if (!target) return;
      managers.tab.closeTab(managers.tab.findIndex(target.label));
    } else {
      managers.tab.closeTab(tab.index);
    }
  },
};
