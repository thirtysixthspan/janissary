import type { Command } from './types.js';
import { parseMsgCommand } from '../messaging.js';

export const command: Command = {
  name: 'msg',
  match: (cmd) => /^msg\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, activeTab, sendMessage } = ctx;
    const fromLabel = tabs[activeTab].label;
    const parsed = parseMsgCommand(cmd);
    const result = 'error' in parsed
      ? parsed.error
      : parsed.to === fromLabel
        ? 'Cannot message yourself.'
        : !sendMessage({ from: fromLabel, to: parsed.to, kind: parsed.kind, text: parsed.text })
          ? `No agent named "${parsed.to}".`
          : `Sent ${parsed.kind} to ${parsed.to}.`;
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: cmd, output: result }], scrollOffset: 0 }));
  },
};
