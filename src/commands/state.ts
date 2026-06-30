import type { Command } from './types.js';
import { loadAgentState } from '../agent-state.js';
import { formatState } from '../state-format.js';

export const command: Command = {
  name: 'state',
  match: (command_) => command_.toLowerCase() === 'state',
  run: (_command, context) => {
    context.out(formatState(context.label, loadAgentState(context.label) ?? null));
  },
};
