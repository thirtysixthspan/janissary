import type { Tab } from './types.js';

function uniqueLabel(used: Set<string>, prefix: string): string {
  if (!used.has(prefix)) return prefix;
  let n = 2;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export function uniquePluginLabel(tabs: Tab[], prefix: string): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), prefix);
}


export function uniqueEditorLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'editor');
}

export function uniqueFilesLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'navigator');
}
