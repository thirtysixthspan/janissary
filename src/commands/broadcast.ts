import type { Command } from './types.js';
import { parseBroadcastCommand } from '../messaging.js';

export const command: Command = {
  name: 'broadcast',
  match: (command_) => /^broadcast\b/i.test(command_),
  handler: (command_, context) => {
    const { updateCurrentTab, tabs, activeTab, sendMessage } = context;
    const fromLabel = tabs[activeTab].label;
    const parsed = parseBroadcastCommand(command_);
    if ('error' in parsed) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: command_, output: parsed.error }], scrollOffset: 0 }
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
    if (sent.length > 0) segments.push(`Sent ${parsed.kind} to ${sent.join(', ')}.`);
    if (missing.length > 0) segments.push(`No agent named: ${missing.join(', ')}.`);
    if (segments.length === 0) segments.push('No other agents to broadcast to.');
    updateCurrentTab((tab) => (
      { ...tab, log: [...tab.log, { input: command_, output: segments.join(' ') }], scrollOffset: 0 }
    ));
  },
};
