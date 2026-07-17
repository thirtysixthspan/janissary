import type { Tab } from '../types.js';

function uniqueLabel(used: Set<string>, prefix: string): string {
  if (!used.has(prefix)) return prefix;
  let n = 2;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export function uniqueImageLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'image');
}

export function uniqueMarkdownLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'markdown');
}

export function uniqueEditorLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'editor');
}

export function uniqueFilesLabel(tabs: Tab[]): string {
  return uniqueLabel(new Set(tabs.map((t) => t.label)), 'navigator');
}

export function uniquePageNumber(tabs: Tab[]): number {
  const used = new Set(tabs.filter((t) => t.page).map((t) => t.page!.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
