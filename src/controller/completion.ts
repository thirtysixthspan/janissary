import { completeCommandLine } from '../completion/index.js';
import type { Managers } from '../managers.js';
import type { CompletionResult } from '../completion/types.js';
import { listPersonas } from '../personas.js';

export function complete(managers: Managers, text: string, cursor: number): CompletionResult {
  const tab = managers.tab.cur();
  const cwd = managers.tab.cwdOf(tab.label) ?? process.cwd();
  const agents = managers.tab.allLabels();
  const actionTabs = managers.tab.tabs.filter((t) => t.view !== 'monitor');
  const groups = [...new Set(actionTabs.map((t) => t.group))].toSorted((a, b) => a - b).map((g) => `group:${g}`);
  const targets = [...actionTabs.map((t) => t.label).filter((l) => l !== tab.label), ...groups];
  return completeCommandLine(
    text, cursor, cwd, agents, managers.connection.completionConnections(tab.label),
    { personas: listPersonas('monitor'), targets },
  );
}
