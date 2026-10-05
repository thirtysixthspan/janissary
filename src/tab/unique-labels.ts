import type { Tab } from './types.js';
import { checkLaunchName, poolCandidates, type LaunchNameRow } from '../launch-name/check.js';

function uniqueLabel(used: Set<string>, prefix: string): string {
  if (!used.has(prefix)) return prefix;
  let n = 2;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export function uniquePluginLabel(tabs: Tab[], prefix: string): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), prefix);
}

// A pool name by the same rule an unnamed agent launch takes one: free of every open tab and of
// every session row that could still come back. Undefined once the pool runs out.
export function unusedAgentName(tabs: Tab[], rows: readonly LaunchNameRow[]): string | undefined {
  const result = checkLaunchName({
    name: '', explicit: false, tabs: tabs.map((t) => t.label), rows, candidates: poolCandidates(),
  });
  return result.accepted ? result.name : undefined;
}


export function uniqueEditorLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'editor');
}

export function uniqueFilesLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'navigator');
}
