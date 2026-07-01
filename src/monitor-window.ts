import type { MonitorSuggestion, Tab } from './types.js';
import { makeTab } from './tab.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// Monitor reporting tabs: each external-mode monitor gets its own view-only tab
// (`view: 'monitor'`) named after its persona (e.g. `security`, `quality`) and colored
// after the tab it monitors — the reporting strip and body left-border carry that color.
// Reporting tabs render in the reporting section below the command bar, never in the
// action strip, and accept no commands; their only interactions are the per-suggestion
// Run/Dismiss buttons (RPCs handled here).

const makeMonitorTab = (name: string, dotColor: string, number: number): Tab => ({
  // Group 0: reporting tabs sit outside the action-tab group system.
  ...makeTab(name, dotColor, number, [], [], undefined, 0, dotColor),
  view: 'monitor',
  title: name,
  monitor: { suggestions: [] },
});

// All monitor reporting tabs currently open.
export function monitorTabs(managers: Managers): Tab[] {
  return managers.tab.tabs.filter((t) => t.view === 'monitor');
}

// Open the named monitor's reporting tab or reuse the existing one. Reporting tabs are
// appended at the end of the tab list so action-tab indices (including `activeTab`)
// never shift, and the active tab is left untouched.
export function openMonitorTab(managers: Managers, name: string, dotColor: string): Tab {
  const existing = monitorTabs(managers).find((t) => t.label === name);
  if (existing) return existing;
  const tabs = managers.tab.tabs;
  const tab = makeMonitorTab(name, dotColor, tabs.length + 1);
  managers.tab.tabs = [...tabs, tab];
  messageBus.emit('state', { type: 'dirty' });
  return tab;
}

// Append a suggestion to the named monitor's feed (opening its tab if needed).
export function pushSuggestion(managers: Managers, name: string, dotColor: string, suggestion: MonitorSuggestion): void {
  const tab = openMonitorTab(managers, name, dotColor);
  tab.monitor!.suggestions.push(suggestion);
  messageBus.emit('state', { type: 'dirty' });
}

// Remove a suggestion from whichever monitor feed holds it (the × button).
export function dismissSuggestion(managers: Managers, id: string): void {
  for (const tab of monitorTabs(managers)) {
    const before = tab.monitor!.suggestions.length;
    tab.monitor!.suggestions = tab.monitor!.suggestions.filter((s) => s.id !== id);
    if (tab.monitor!.suggestions.length !== before) messageBus.emit('state', { type: 'dirty' });
  }
}

// Run a suggestion's command in the tab the suggestion is about (the Run button), then
// remove it from the feed. Monitor tabs themselves never execute commands.
export function runSuggestion(managers: Managers, id: string): void {
  const suggestion = monitorTabs(managers)
    .flatMap((t) => t.monitor!.suggestions)
    .find((s) => s.id === id);
  if (!suggestion?.command) return;
  managers.command.dispatchTo(suggestion.about, suggestion.command);
  dismissSuggestion(managers, id);
}
