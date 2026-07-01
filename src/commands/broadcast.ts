import type { Command } from './types.js';
import { parseBroadcastCommand } from '../messaging.js';

export const command: Command = {
  name: 'broadcast',
  match: (command_) => /^broadcast\b/i.test(command_),
  run: (command_, tab, managers) => {
    const parsed = parseBroadcastCommand(command_);
    if ('error' in parsed) { managers.tab.append(tab.label, { input: command_, output: parsed.error }); return; }
    const targets = parsed.targets === 'all'
      ? managers.tab.allLabels().filter((l) => l !== tab.label)
      : parsed.targets;
    const missing: string[] = [];
    for (const to of targets) {
      if (!managers.communication.send({ from: tab.label, to, kind: parsed.kind, text: parsed.text })) missing.push(to);
    }
    if (missing.length > 0) managers.tab.append(tab.label, { input: command_, output: `No agent named: ${missing.join(', ')}.` });
  },
};
