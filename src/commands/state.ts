import type { Command } from './types.js';
import { loadAgentState } from '../agent/state.js';
import { formatState } from '../state-format.js';

export const command: Command = {
  name: 'state',
  match: (command_) => command_.toLowerCase() === 'state',
  run: (command, tab, managers) => {
    managers.tab.append(tab.label, { input: command, output: formatState(tab.label, loadAgentState(tab.label) ?? null) });
  },
};
