import type { BackgroundReplyView } from '../protocol.js';
import type { Tab } from './types.js';

// The same ACP token `src/commands/acp.ts` matches, with the optional leading slash the command bar
// strips before dispatch. A monitor reply's input starts with `monitor ask`, so it keeps no line.
const ACP_INPUT = /^\s*\/?acp\b/i;

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
