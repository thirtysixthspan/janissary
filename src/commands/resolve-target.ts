import { byLabelOrAlias } from '../tab/lookup.js';
import type { Tab } from '../tab/types.js';
import type { CommandManagers } from './types.js';

// Resolve a command's target tab by its label or display alias (see `rename`), appending the
// standard "not found" message and returning undefined if there's no match — shared by
// `queue`, `send`, and `close`, which all address a tab this way.
export function resolveTarget(label: string, managers: CommandManagers, append: (text: string) => void): Tab | undefined {
  const target = byLabelOrAlias(managers.tab.tabs, label);
  if (!target) { append(`No tab named "${label}".`); return undefined; }
  return target;
}
