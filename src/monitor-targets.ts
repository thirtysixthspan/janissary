import type { MonitorTarget, Tab } from './types.js';

// Target helpers for the monitor manager: validation, live matching, and the color a
// reporting tab inherits. All operate on the current tab list — group targets are
// resolved at event time, so group membership stays dynamic.

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
