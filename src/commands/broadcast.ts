import type { Command } from './types.js';
import { parseBroadcastCommand } from '../messaging.js';

export const command: Command = {
  name: 'broadcast',
  match: (cmd) => /^broadcast\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, activeTab, sendMessage } = ctx;
    const fromLabel = tabs[activeTab].label;
    const parsed = parseBroadcastCommand(cmd);
    if ('error' in parsed) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: cmd, output: parsed.error }], scrollOffset: 0 }
      ));
      return;
    }
    const targets = (parsed.targets === 'all'
      ? tabs.map((t) => t.label)
      : parsed.targets
    ).filter((to) => to !== fromLabel);
    const sent: string[] = [];
    const missing: string[] = [];
    for (const to of targets) {
      if (sendMessage({ from: fromLabel, to, kind: parsed.kind, text: parsed.text })) sent.push(to);
      else missing.push(to);
    }
    const segments: string[] = [];
    if (sent.length) segments.push(`Sent ${parsed.kind} to ${sent.join(', ')}.`);
    if (missing.length) segments.push(`No agent named: ${missing.join(', ')}.`);
    if (!segments.length) segments.push('No other agents to broadcast to.');
    updateCurrentTab((tab) => (
      { ...tab, log: [...tab.log, { input: cmd, output: segments.join(' ') }], scrollOffset: 0 }
    ));
  },
};
