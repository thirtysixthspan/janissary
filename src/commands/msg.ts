import type { Command } from './types.js';
import { parseMsgCommand as parseMessageCommand } from '../messaging.js';

export const command: Command = {
  name: 'msg',
  match: (command_) => /^msg\b/i.test(command_),
  run: (command_, tab, managers) => {
    const parsed = parseMessageCommand(command_);
    if ('error' in parsed) { managers.tab.append(tab.label, { input: command_, output: parsed.error }); return; }
    if (!managers.communication.send({ from: tab.label, to: parsed.to, kind: parsed.kind, text: parsed.text })) {
      managers.tab.append(tab.label, { input: command_, output: `No agent named "${parsed.to}".` });
      return;
    }
    managers.tab.append(tab.label, { input: command_, output: `→ ${parsed.to} (${parsed.kind}): ${parsed.text}` });
  },
};
