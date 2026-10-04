import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';
import { complete } from '../controller/completion.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';

// The four capabilities that make a plugin tab a place a line can be typed and a process can be
// checked on: where it is, which tab a line runs in, what the application would complete it to, and
// whether the terminal behind it is still alive. They are one group because they are one pull request's
// worth of additions, because each exists for the same reason — a plugin tab is not an agent tab, so it
// has no route to any of this — and because they depend on nothing here beyond the managers, the
// declaration, the origin tab, the answering tab and the enabled check. `createPluginContext` composes
// them back with one spread.
export function lineCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  answeringLabel?: string;
  isEnabled: () => boolean;
}): Pick<TabPluginServerCapabilities, 'originTab' | 'dispatchLine' | 'completeLine' | 'terminalRunning'> {
  const { managers, declaration, origin, answeringLabel, isEnabled } = input;
  // The labels of this plugin's own open tabs — the only terminals whose ids a plugin can legitimately
  // hold, because a payload factory is the only scope in which it may start one.
  const ownTabLabels = () => managers.tab.tabs
    .filter((tab) => tab.plugin?.id === declaration.id)
    .map((tab) => tab.label);
  return {
    originTab: () => {
      if (!isEnabled()) return null;
      const tab = managers.tab.byLabel(origin.label);
      if (!tab) return null;
      return {
        label: tab.label,
        cwd: managers.tab.cwdOf(origin.label) ?? managers.tab.launchDir,
        ...(tab.workspaceDir && {
          workspace: { dir: tab.workspaceDir, offline: tab.offline ?? false },
        }),
      };
    },
    // The tab a dispatched line runs in. That is the tab answering when the host named one — a line
    // typed into a plugin tab's own command line runs in that tab — and the tab a command was invoked
    // from otherwise, which is all a command or selection action has. An answering tab that has since
    // closed falls back rather than addressing a label with no tab behind it, which would silently drop
    // the output on the floor.
    dispatchLine: (line) => {
      if (!isEnabled()) return false;
      const answering = answeringLabel && managers.tab.byLabel(answeringLabel);
      return managers.command.dispatchLine(answering ? answeringLabel : origin.label, line);
    },
    completeLine: (line, cursor) => (isEnabled() ? complete(managers, line, cursor) : { matches: [], newInput: line, newCursor: cursor }),
    // Scoped to this plugin's own tabs rather than to whatever id it was handed. Pty ids come from a
    // plain counter, so an unscoped answer lets a plugin enumerate them and learn which other
    // processes in the window are alive — and the contract has always said "a terminal this plugin
    // spawned", which is the question asked here.
    terminalRunning: (ptyId) => isEnabled() && managers.pty.isRunningFor(ptyId, ownTabLabels()),
  };
}