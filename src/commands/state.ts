import type { Command } from './types.js';
import type { Managers } from '../managers.js';
import type { AgentState } from '../agent/types.js';
import { loadAgentState } from '../agent/state.js';
import { formatState } from '../state-format.js';

// The saved state when there is a file, and otherwise, for a tab that is never saved — a shell tab or
// any other plugin tab — the same fields built from the open tab, which is what its file would hold.
// An agent tab without a file, remote or not yet written, has nothing to show.
function stateFor(label: string, managers: Managers): AgentState | null {
  const saved = loadAgentState(label);
  if (saved) return saved;
  const tab = managers.tab.byLabel(label);
  if (!tab || tab.view === undefined || tab.view === 'agent') return null;
  return managers.tab.buildAgentState(tab);
}

export const command: Command = {
  name: 'state',
  match: (command_) => command_.toLowerCase() === 'state',
  samples: ['state'],
  run: (command, tab, managers) => {
    managers.tab.append(tab.label, {
      input: command, output: formatState(tab.label, stateFor(tab.label, managers)), markdown: true,
    });
  },
};
