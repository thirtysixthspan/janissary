import type { MonitorSuggestion } from '../tab/types.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { isMonitorTab, type MonitorTab } from '../tab/view-guards.js';
export { findSuggestion, removeSuggestion, runSuggestion, rateSuggestion } from './suggestions.js';

// Monitor reporting tabs: each external-mode monitor gets its own view-only tab
// (`view: 'monitor'`) labelled with the monitor's runtime name (e.g. `security`, `quality`) and
// colored after the tab it monitors — the reporting strip and body left-border carry that color.
// Reporting tabs render in the reporting section below the command bar, never in the
// action strip, and accept no commands; their only interactions are the per-suggestion
// Run/Dismiss buttons (RPCs handled here).

const makeMonitorTab = (name: string, persona: string, dotColor: string, number: number): MonitorTab => ({
  // Group 0: reporting tabs sit outside the action-tab group system.
  ...makeTab(name, dotColor, number, [], [], undefined, 0, dotColor),
  view: 'monitor',
  title: name,
  // Both are fixed at creation: the label is the runtime name, and the persona is whichever one the
  // monitor runs — the same word unless a profile gave the monitor a name of its own.
  // `targets`/`contextBytes` are filled in afterward via `updateMonitorMeta` once the owning monitor
  // registration exists.
  monitor: { suggestions: [], name, persona, targets: '', contextBytes: 0 },
});

// All monitor reporting tabs currently open. The guard admits only those that actually carry the
// payload, so every consumer reads `monitor` without asserting — a reporting tab somehow missing it
// is skipped rather than dereferenced.
export function monitorTabs(managers: Managers): MonitorTab[] {
  return managers.tab.tabs.filter((t) => isMonitorTab(t));
}

// Open the named monitor's reporting tab or reuse the existing one. Reporting tabs are
// appended at the end of the tab list so action-tab indices (including `activeTab`)
// never shift, and the active tab is left untouched.
export function openMonitorTab(managers: Managers, name: string, persona: string, dotColor: string): MonitorTab {
  const existing = monitorTabs(managers).find((t) => t.label === name);
  if (existing) return existing;
  const tabs = managers.tab.tabs;
  const tab = makeMonitorTab(name, persona, dotColor, tabs.length + 1);
  managers.tab.tabs = [...tabs, tab];
  messageBus.emit('state', { type: 'dirty' });
  return tab;
}

// Append a suggestion to the named monitor's feed (opening its tab if needed).
export function pushSuggestion(
  managers: Managers, name: string, persona: string, dotColor: string, suggestion: MonitorSuggestion,
): void {
  const tab = openMonitorTab(managers, name, persona, dotColor);
  tab.monitor.suggestions.push(suggestion);
  messageBus.emit('state', { type: 'dirty' });
}

// Update a persona's reporting tab with its monitor's current targets and running
// context-byte total. A no-op if the tab or its monitor payload is gone.
export function updateMonitorMeta(managers: Managers, name: string, targets: string, contextBytes: number): void {
  const tab = monitorTabs(managers).find((t) => t.label === name);
  if (!tab?.monitor) return;
  tab.monitor.targets = targets;
  tab.monitor.contextBytes = contextBytes;
  messageBus.emit('state', { type: 'dirty' });
}

// Close a persona's reporting tab (used when the last monitor feeding it goes away
// with its owning agent tab).
export function closeMonitorTab(managers: Managers, name: string): void {
  const index = managers.tab.tabs.findIndex((t) => t.view === 'monitor' && t.label === name);
  if (index !== -1) managers.tab.closeTab(index);
}
