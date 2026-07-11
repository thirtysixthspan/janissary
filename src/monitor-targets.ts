import type { LogEntry, MonitorTarget, Tab } from './types.js';

// Target helpers for the monitor manager: validation, live matching, and the color a
// reporting tab inherits. All operate on the current tab list — group targets are
// resolved at event time, so group membership stays dynamic.

// The current tabs a monitor's targets resolve to: a tab target's tab, or every member of a group
// target. Shared by the initial-seed loop and the harness feed so both resolve targets identically.
export function resolveTargetTabs(tabs: Tab[], targets: MonitorTarget[]): Tab[] {
  return tabs.filter((t) => targets.some((target) =>
    target.kind === 'tab' ? t.label === target.label : t.group === target.group));
}

// The buffer entries to seed a monitor with at start: every existing `LogEntry` of each target tab,
// tagged with that tab's label.
export function seedEntries(tabs: Tab[], targets: MonitorTarget[]): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(tabs, targets)) {
    for (const entry of tab.log) entries.push({ tabLabel: tab.label, entry });
  }
  return entries;
}

export function validateTargets(tabs: Tab[], personaName: string, inline: boolean, targets: MonitorTarget[]): string | null {
  for (const target of targets) {
    if (target.kind === 'tab' && tabs.every((t) => t.label !== target.label || t.view === 'monitor')) {
      return `No tab named "${target.label}".`;
    }
    if (target.kind === 'group' && tabs.every((t) => t.group !== target.group)) {
      return `No group ${target.group}.`;
    }
  }
  // The reporting tab reuses the persona name as its label; an action tab holding that
  // label would collide with by-label lookups (e.g. runSuggestion's dispatch).
  if (!inline && tabs.some((t) => t.label === personaName && t.view !== 'monitor')) {
    return `A tab named "${personaName}" already exists; rename it or pick another persona.`;
  }
  return null;
}

// A human-readable rendering of a monitor's targets, e.g. `agent2, group:3`.
export function formatTargets(targets: MonitorTarget[]): string {
  return targets.map((t) => (t.kind === 'tab' ? t.label : `group:${t.group}`)).join(', ');
}

export function matchesTargets(tabs: Tab[], targets: MonitorTarget[], tabLabel: string): boolean {
  const tab = tabs.find((t) => t.label === tabLabel);
  if (!tab || tab.view === 'monitor') return false;
  return targets.some((t) => (t.kind === 'tab' ? t.label === tabLabel : t.group === tab.group));
}

// Reporting tabs carry the monitored tab's color: the first tab target's dot color, or
// the first member of the first group target.
export function targetColor(tabs: Tab[], targets: MonitorTarget[]): string {
  for (const target of targets) {
    const tab = target.kind === 'tab'
      ? tabs.find((t) => t.label === target.label)
      : tabs.find((t) => t.group === target.group);
    if (tab) return target.kind === 'group' ? tab.groupColor : tab.dotColor;
  }
  return '#5b9cff';
}
