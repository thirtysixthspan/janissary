import type { Command } from './types.js';

export const command: Command = {
  name: 'acp-reset',
  match: (command_) => /^acp\s+reset\b/i.test(command_),
  run: (_command, tab, managers) => {
    const hadSession = managers.acp.close(tab.label);
    managers.tab.append(tab.label, {
      input: _command,
      output: hadSession
        ? 'ACP session reset — next acp prompt will start fresh.'
        : 'No active ACP session to reset.',
    });
  },
};
