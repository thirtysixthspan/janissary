import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';
import type { PortClosures } from './port.js';
import type { NavPort } from './navigation.js';
import type { OpenPort } from './open.js';

export function makeNavigationPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  closures: PortClosures,
): NavPort {
  return {
    states, ...closures,
    setCwd: (label, dir) => managers.tab.setCwd(label, dir),
    hasTab: (label) => managers.tab.tabs.some((t) => t.label === label),
  };
}

export function makeOpenPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  closures: PortClosures,
): OpenPort {
  return { managers, states, ...closures };
}
