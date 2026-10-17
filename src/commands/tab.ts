import type { Command } from './types.js';
import { resolveTarget } from './resolve-target.js';
import { appendCommandOutput } from '../command/append.js';

export const command: Command = {
  name: 'tab',
  match: (input) => /^tab(?:\s|$)/i.test(input),
  samples: ['tab', 'tab focus notes', 'TAB other'],
  run: (input, tab, managers, invocation) => {
    const append = (output: string) => appendCommandOutput(managers, tab.label, { input, output }, invocation);
    const match = /^tab\s+focus\s+(.+)$/i.exec(input.trim());
    const name = match?.[1].trim();
    if (!name) { append('Usage: tab focus <name>.'); return; }
    const target = resolveTarget(name, managers, append);
    if (target) managers.tab.setActiveTab(managers.tab.findIndex(target.label));
  },
};
