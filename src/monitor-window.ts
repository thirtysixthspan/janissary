import type { MonitorSuggestion, Tab } from './types.js';
import type { MonitorSub } from './monitor-manager.js';
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
  // The reporting tab's label is always its persona name (see `MonitorManager.start`), so
  // `persona` never changes after creation; `targets`/`contextBytes` are filled in afterward
  // via `updateMonitorMeta` once the owning monitor registration exists.
  monitor: { suggestions: [], persona: name, targets: '', contextBytes: 0 },
});

// A unique label for a new monitor's reporting tab: the persona name, suffixed
// (`assistant-2`, …) when that label is already taken by any tab. Each monitor instance
// gets its own window, so the same persona can watch different targets side by side.
export function allocateMonitorLabel(managers: Managers, persona: string): string {
  const used = new Set(managers.tab.tabs.map((t) => t.label));
  if (!used.has(persona)) return persona;
  let n = 2;
  while (used.has(`${persona}-${n}`)) n++;
  return `${persona}-${n}`;
}

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

// Find a suggestion anywhere in the monitor feeds by id.
export function findSuggestion(managers: Managers, id: string): MonitorSuggestion | undefined {
  return monitorTabs(managers)
    .flatMap((t) => t.monitor!.suggestions)
    .find((s) => s.id === id);
}

// Remove a suggestion from whichever feed holds it (thumbs-down).
export function removeSuggestion(managers: Managers, id: string): void {
  for (const tab of monitorTabs(managers)) {
    const before = tab.monitor!.suggestions.length;
    tab.monitor!.suggestions = tab.monitor!.suggestions.filter((s) => s.id !== id);
    if (tab.monitor!.suggestions.length !== before) messageBus.emit('state', { type: 'dirty' });
  }
}

// Run a suggestion's command in the tab the suggestion is about (a clicked command
// line). The suggestion stays in the feed — the history of what was suggested (and run)
// is part of the record. Monitor tabs themselves never execute commands.
export function runSuggestion(managers: Managers, id: string): void {
  const suggestion = findSuggestion(managers, id);
  if (!suggestion?.command) return;
  managers.command.dispatchTo(suggestion.about, suggestion.command);
}

// Thumbs up/down on a reporting-tab suggestion. The rating is fed back to the monitor through its
// normal batched prompt channel (queued on the owning monitor's buffer, no extra ACP round-trip),
// so the AI learns what the user found useful. Rating a suggestion means the user is done with it,
// so either direction removes it from the feed.
export function rateSuggestion(monitors: Iterable<MonitorSub>, managers: Managers, id: string, up: boolean): void {
  const suggestion = findSuggestion(managers, id);
  if (!suggestion) return;
  const reg = [...monitors].find((r) => !r.inline && r.persona.name === suggestion.persona);
  reg?.buffer.push({
    tabLabel: suggestion.about,
    entry: { input: '', output: `[user feedback] The user rated your suggestion "${suggestion.text}" as ${up ? 'helpful (thumbs up)' : 'not helpful (thumbs down)'}.` },
  });
  removeSuggestion(managers, id);
}
