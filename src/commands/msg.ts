import type { Command } from './types.js';
import { parseMsgCommand as parseMessageCommand } from '../messaging.js';

export const command: Command = {
  name: 'msg',
  match: (command_) => /^msg\b/i.test(command_),
  handler: (command_, context) => {
    const { updateCurrentTab, tabs, activeTab, sendMessage } = context;
    const fromLabel = tabs[activeTab].label;
    const parsed = parseMessageCommand(command_);
    const result = 'error' in parsed
      ? parsed.error
      : parsed.to === fromLabel
        ? 'Cannot message yourself.'
        : sendMessage({ from: fromLabel, to: parsed.to, kind: parsed.kind, text: parsed.text })
          ? `→ ${parsed.to} (${parsed.kind}): ${parsed.text}`
          : `No agent named "${parsed.to}".`;
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: command_, output: result }], scrollOffset: 0 }));
  },
};
