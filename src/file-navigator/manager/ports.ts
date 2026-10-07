import type { Managers } from '../../managers.js';
import type { FilesTabState } from '../state.js';
import type { PortClosures } from '../port.js';
import type { NavPort } from '../navigation.js';
import type { OpenPort } from '../open.js';
import { notify } from '../../notifications/index.js';
import { errorFirstLine } from '../../error-text.js';

export function makeNavigationPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  closures: PortClosures,
): NavPort {
  return {
    states, ...closures,
    setCwd: (label, dir) => managers.tab.setCwd(label, dir),
    hasTab: (label) => managers.tab.tabs.some((t) => t.label === label),
    reportFailure: (label, target, error) => {
      notify(managers, 'manual', label, `Could not navigate to ${target}: ${errorFirstLine(error)}.`);
    },
  };
}

export function makeOpenPort(
  managers: Managers,
  states: Map<string, FilesTabState>,
  closures: PortClosures,
): OpenPort {
  return { managers, states, ...closures };
}
