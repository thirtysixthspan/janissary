import type { Command } from './types.js';
import { parseMsgCommand as parseMessageCommand } from '../messaging.js';

export const command: Command = {
  name: 'msg',
  match: (command_) => /^msg\b/i.test(command_),
  run: (command_, context) => {
    const parsed = parseMessageCommand(command_);
    if ('error' in parsed) { context.out(parsed.error); return; }
    if (!context.send({ from: context.label, to: parsed.to, kind: parsed.kind, text: parsed.text })) {
      context.out(`No agent named "${parsed.to}".`);
      return;
    }
    // Record the sent message in the sender's own transcript.
    context.out(`→ ${parsed.to} (${parsed.kind}): ${parsed.text}`);
  },
};
