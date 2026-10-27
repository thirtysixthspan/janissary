import type { Command } from './types.js';
import { resolveTarget } from './resolve-target.js';
import { appendCommandOutput } from '../command/append.js';
import { parseTabCommand } from './parse-tab.js';
import { notify } from '../notifications/index.js';

export const command: Command = {
  name: 'tab',
  match: (input) => /^tab(?:\s|$)/i.test(input),
  samples: [
    'tab', 'tab focus notes', 'tab move notes 2', 'tab pane notes right', 'tab split notes',
    'tab color notes #ff0000', 'tab group notes review', 'tab dock notes left', 'tab undock notes',
  ],
  run: (input, tab, managers, invocation) => {
    const append = (output: string) => appendCommandOutput(managers, tab.label, { input, output }, invocation);
    const parsed = parseTabCommand(input);
    if ('error' in parsed) { append(parsed.error); return; }
    const isFocus = 'kind' in parsed;
    const name = isFocus ? parsed.name : parsed.target;
    const target = resolveTarget(name, managers, append);
    if (!target) return;
    if (isFocus) {
      managers.tab.setActiveTab(managers.tab.findIndex(target.label));
      return;
    }
    if (!managers.tab.arrangeTab(target.label, parsed.change)) {
      const message = parsed.change.kind === 'group'
        ? `Cannot group "${name}".`
        : parsed.change.kind === 'pane' || parsed.change.kind === 'split'
          ? `Cannot move "${name}" to a pane.`
          : parsed.change.kind === 'undock'
            ? `Cannot undock "${name}".`
            : `Cannot dock "${name}".`;
      notify(managers, 'tab', tab.label, message);
    }
  },
};
