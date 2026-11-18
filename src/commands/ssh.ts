import type { Command } from './types.js';
import { runDelegated } from './delegated.js';

export const command: Command = {
  name: 'ssh',
  match: (command_) => /^ssh\b/i.test(command_),
  samples: ['ssh', 'ssh build-box'],
  run: (command_, tab, managers, invocation) => {
    // A Hosts row reaches this entry through dispatchLineWithOutput and has no transcript of its
    // own: skip the append and let an immediate error travel back through the dispatch result.
    if (managers.tab.byLabel(tab.label)?.plugin?.id === 'hosts') return managers.ssh.run(command_, tab.label);
    runDelegated(command_, tab.label, managers, (input) => managers.ssh.run(input, tab.label), invocation);
  },
};
