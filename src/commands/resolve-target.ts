import type { Tab } from '../types.js';
import type { CommandManagers } from './types.js';

// Resolve a command's target tab by its label or display alias (see `rename`), appending the
// standard "not found" message and returning undefined if there's no match — shared by
// `queue` and `send`, which both address a tab this way.
export function resolveTarget(label: string, managers: CommandManagers, append: (text: string) => void): Tab | undefined {
  const key = label.toLowerCase();
  const target = managers.tab.tabs.find((t) => t.label.toLowerCase() === key || t.title?.toLowerCase() === key);
  if (!target) { append(`No tab named "${label}".`); return undefined; }
  return target;
}
