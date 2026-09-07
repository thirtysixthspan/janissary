import type { Command } from './types.js';
import { runDelegated } from './delegated.js';

export const command: Command = {
  name: 'ssh',
  match: (command_) => /^ssh\b/i.test(command_),
  run: (command_, tab, managers) => {
    runDelegated(command_, tab.label, managers, (input) => managers.ssh.run(input));
  },
};
