import type { Managers } from '../managers.js';
import type { FilesTabState } from './manager.js';
import type { NavPort } from './navigation.js';
import type { OpenPort } from './open.js';

export function makeNavigationPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  watchDir: NavPort['watchDir'],
  unwatchDir: NavPort['unwatchDir'],
  rebuild: NavPort['rebuild'],
  refreshGit: NavPort['refreshGit'],
): NavPort {
  return {
    states, watchDir, unwatchDir, rebuild, refreshGit,
    setCwd: (label, dir) => managers.tab.setCwd(label, dir),
    hasTab: (label) => managers.tab.tabs.some((t) => t.label === label),
  };
}

export function makeOpenPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  watchDir: OpenPort['watchDir'],
  unwatchDir: OpenPort['unwatchDir'],
  rebuild: OpenPort['rebuild'],
  refreshGit: OpenPort['refreshGit'],
): OpenPort {
  return { managers, states, watchDir, unwatchDir, rebuild, refreshGit };
}
