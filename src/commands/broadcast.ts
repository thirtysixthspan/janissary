import type { Command } from './types.js';
import { parseBroadcastCommand } from '../messaging.js';

export const command: Command = {
  name: 'broadcast',
  match: (command_) => /^broadcast\b/i.test(command_),
  run: (command_, context) => {
    const parsed = parseBroadcastCommand(command_);
    if ('error' in parsed) { context.out(parsed.error); return; }
    const targets = parsed.targets === 'all'
      ? context.agentLabels().filter((l) => l !== context.label)
      : parsed.targets;
    const missing: string[] = [];
    for (const to of targets) {
      if (!context.send({ from: context.label, to, kind: parsed.kind, text: parsed.text })) missing.push(to);
    }
    if (missing.length > 0) context.out(`No agent named: ${missing.join(', ')}.`);
  },
};
