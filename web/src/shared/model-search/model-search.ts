import { contiguousMatch } from '../fuzzy-match';

export type HarnessModelPair = { harness: string; model: string };

const RESULT_CAP = 10;

function longestCommonPrefix(items: string[]): string {
  if (items.length === 0) return '';
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

export function completeModel(ids: string[], text: string): string | null {
  const matches = contiguousMatch(ids, text, ids.length);
  if (matches.length === 0) return null;

  const trimmed = text.trim();
  const completed = matches.length === 1
    ? matches[0].path
    : longestCommonPrefix(matches.map((match) => match.path));

  if (matches.length > 1) {
    if (completed.length <= trimmed.length) return null;
    if (!completed.toLowerCase().includes(trimmed.toLowerCase())) return null;
  }
  return completed === text ? null : completed;
}

export function mostUsedModels(
  roleEntries: readonly (readonly HarnessModelPair[])[],
  harness: string,
  ids: string[],
): string[] {
  const eligible = new Set(ids);
  const usage = new Map<string, number>();
  for (const entries of roleEntries) {
    const counted = new Set<string>();
    for (const entry of entries) {
      if (entry.harness !== harness || !eligible.has(entry.model) || counted.has(entry.model)) continue;
      counted.add(entry.model);
      usage.set(entry.model, (usage.get(entry.model) ?? 0) + 1);
    }
  }
  return [...usage]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, RESULT_CAP)
    .map(([model]) => model);
}
