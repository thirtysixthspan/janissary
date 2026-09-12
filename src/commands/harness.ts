import type { Command } from './types.js';
import { runDelegated } from './delegated.js';

export const command: Command = {
  name: 'harness',
  match: (command_) => /^harness\b/i.test(command_),
  samples: ['harness', 'harness claude'],
  // Bare `harness` (no args) opens the launch dialog instead of erroring; no transcript line is
  // recorded, so nothing is appended ahead of the dialog. Every other `harness …` form runs.
  run: (command_, tab, managers) => {
    if (command_.trim().toLowerCase() === 'harness') { managers.harness.openLaunchDialog(); return; }
    runDelegated(command_, tab.label, managers, (input) => managers.harness.run(input));
  },
};
