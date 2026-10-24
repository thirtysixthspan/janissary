import path from 'node:path';
import { expandUserPath } from '../paths.js';
import type { Managers } from '../managers.js';

// A path typed in a tab, resolved the way `open` and `edit` resolve one: `$root` and `~` expand
// against the project directory, an absolute result stands as written, and a still-relative one
// lands in the tab's working directory (`TabManager.workingDirOf`).
export function resolveTabPath(managers: Pick<Managers, 'tab'>, label: string, target: string): string {
  const expanded = expandUserPath(target, { root: managers.tab.launchDir });
  return path.isAbsolute(expanded) ? expanded : path.resolve(managers.tab.workingDirOf(label), expanded);
}
