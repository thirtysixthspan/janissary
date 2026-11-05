import type { BackgroundReplyView } from '../protocol.js';
import type { Tab } from './types.js';

// The same `ask` token `src/commands/ask.ts` matches, with the optional leading slash the command bar
// strips before dispatch. A monitor reply's input starts with `monitor ask`, so it keeps no line.
const ACP_INPUT = /^\s*\/?ask\b/i;

export function backgroundRepliesFor(tab: Tab): BackgroundReplyView[] {
  return tab.log.flatMap((entry) => {
    if (!entry.background || entry.running) return [];
    return [{
      id: entry.background,
      output: entry.output,
      ...(ACP_INPUT.test(entry.input) && { line: entry.input }),
    }];
  });
}
