import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const COMMAND_VIEWS: ReadonlySet<Tab['view']> = new Set<Tab['view']>([undefined, 'agent', 'harness']);

export function canRunSchedules(tab: Tab, managers: Managers): boolean {
  if (COMMAND_VIEWS.has(tab.view)) return true;
  return tab.view === 'plugin' && managers.pty.terminalIdFor(tab.label) !== undefined;
}
