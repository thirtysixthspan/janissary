import type { LogEntry, MonitorTarget, Tab } from '../types.js';

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

// Resolve a tab-kind target's typed label against a tab's canonical label or display alias
// (see `rename`), case-insensitively — mirrors `resolveTarget` in commands/resolve-target.ts.
// A target that matches no tab passes through unchanged, so `validateTargets` still reports
// it as missing. Group targets pass through unchanged.
export function resolveTargetAliases(tabs: Tab[], targets: MonitorTarget[]): MonitorTarget[] {
  return targets.map((target) => {
    if (target.kind !== 'tab') return target;
    const key = target.label.toLowerCase();
    const match = tabs.find((t) => t.label.toLowerCase() === key || t.title?.toLowerCase() === key);
    return match ? { kind: 'tab', label: match.label } : target;
  });
}

export function validateTargets(tabs: Tab[], reportLabel: string, inline: boolean, targets: MonitorTarget[]): string | null {
  for (const target of targets) {
    if (target.kind === 'tab' && tabs.every((t) => t.label !== target.label || t.view === 'monitor')) {
      return `No tab named "${target.label}".`;
    }
    if (target.kind === 'group' && tabs.every((t) => t.group !== target.group)) {
      return `No group ${target.group}.`;
    }
  }
  // The reporting tab takes the monitor's name as its label; an action tab holding that
  // label would collide with by-label lookups (e.g. runSuggestion's dispatch).
  if (!inline && tabs.some((t) => t.label === reportLabel && t.view !== 'monitor')) {
    return `A tab named "${reportLabel}" already exists; rename it or pick another monitor name.`;
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
