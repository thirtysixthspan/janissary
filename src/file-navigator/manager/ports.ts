import type { Managers } from '../../managers.js';
import type { FilesTabState } from '../state.js';
import type { PortClosures } from '../port.js';
import type { NavPort } from '../navigation.js';
import type { OpenPort } from '../open.js';
import { notify } from '../../notifications/index.js';
import { errorFirstLine } from '../../error-text.js';
import { abbreviateWorkspacePath } from '../../paths.js';

// The directory a navigation failed to reach, as a notification shows it. A remote tab's target is
// inside its remote workspace, so the `$workspace` form is the only one that fits it; anything else
// is this machine's, and takes the ordinary root/home abbreviation. Defined per tab, since the two
// answers differ by whether that tab is remote at all.
function navigateTarget(managers: Managers, label: string, target: string): string {
  const workspace = managers.tab.byLabel(label)?.workspaceDir ?? managers.remote.workspaceOf(label);
  return abbreviateWorkspacePath(workspace, target) ?? managers.tab.shorten(target);
}

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
      const shown = navigateTarget(managers, label, target);
      notify(managers, 'manual', label, `Could not navigate to ${shown}: ${errorFirstLine(error)}.`);
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
