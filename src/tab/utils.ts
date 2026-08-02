import type { Tab } from './types.js';

export function stripComments(command: string): string {
  return command.replaceAll(/\s*##(?:[\s\S]*?##\s*|[\s\S]*)/g, ' ').trim();
}

export function renumberTabs(tabs: Tab[]): Tab[] {
  return tabs.map((t, index) => ({ ...t, number: index + 1 }));
}

export function canMoveTab(tabs: Tab[], index: number, direction: -1 | 1): boolean {
  const index_ = index + direction;
  if (index < 0 || index_ < 0 || index_ >= tabs.length) return false;
  return tabs[index].group === tabs[index_].group;
}

export function swapTabsLeft(tabs: Tab[], index: number): Tab[] {
  if (!canMoveTab(tabs, index, -1)) return tabs;
  const next = [...tabs];
  const left = next[index - 1];
  next[index - 1] = next[index];
  next[index] = left;
  return renumberTabs(next);
}

export function swapTabsRight(tabs: Tab[], index: number): Tab[] {
  if (!canMoveTab(tabs, index, 1)) return tabs;
  const next = [...tabs];
  const right = next[index + 1];
  next[index + 1] = next[index];
  next[index] = right;
  return renumberTabs(next);
}

export function insertTabInGroup(tabs: Tab[], tab: Tab, position: 'start' | 'end' = 'end'): Tab[] {
  let insertAt = tabs.length;
  for (const [index, tab_] of tabs.entries()) {
    if (tab_.group !== tab.group) continue;
    if (position === 'start') { insertAt = index; break; }
    insertAt = index + 1;
  }
  return renumberTabs([...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)]);
}

// A unique tab label derived from `base` (a harness name, an ssh destination's host, or a custom
// `as <label>`): `claude`, `claude-2`, … Shared by HarnessManager and SshManager so several tabs
// with the same base name can coexist.
export function uniqueLabel(tabs: Tab[], base: string): string {
  const used = new Set(tabs.map((t) => t.label));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
