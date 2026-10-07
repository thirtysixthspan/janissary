import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';
import type { HandlerDeadline } from './guard.js';
import { complete } from '../controller/completion.js';
import { recordGlobalHistory } from '../global-history.js';
import { messageBus } from '../bus.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';

// The capabilities that make a plugin tab a place a line can be typed and a process can be checked
// on: where it is, which tab a line runs in, what output that line produces, what the application
// would complete it to, and whether the terminal behind it is still alive. They are one group because they are one pull request's
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
  deadline?: HandlerDeadline;
}): Pick<
  TabPluginServerCapabilities,
  'originTab' | 'dispatchLineWithOutput' | 'completeLine' | 'terminalRunning' | 'queueLine' | 'nextQueuedLine' | 'recordCwd'
  | 'recordGlobalHistory'
> {
  const { managers, declaration, origin, answeringLabel, isEnabled, deadline } = input;
  // The tab whose queue and recorded directory a line capability may change: the answering tab, or
  // the origin when there is none, and only when it is one of this plugin's own tabs. A command,
  // selection action or menu handler invoked from an agent tab has no answering tab, and without
  // this check it would reach that agent tab's queue and directory.
  const ownLineLabel = () => {
    const label = answeringLabel ?? origin.label;
    return managers.tab.byLabel(label)?.plugin?.id === declaration.id ? label : undefined;
  };
  // The labels of this plugin's own open tabs — the only terminals whose ids a plugin can legitimately
  // hold, because a payload factory is the only scope in which it may start one.
  const ownTabLabels = () => managers.tab.tabs
    .filter((tab) => tab.plugin?.id === declaration.id)
    .map((tab) => tab.label);
  return {
    originTab: () => {
      if (!isEnabled()) return null;
      const tab = managers.tab.byLabel(answeringLabel ?? origin.label);
      // The launch shell has no tab to come from, so it starts where a new tab does: the project root.
      if (!tab && origin.launch) {
        return { label: origin.label, cwd: managers.tab.launchDir, root: managers.tab.launchDir };
      }
      if (!tab) return null;
      const workspaceDir = tab.workspaceDir ?? (tab.remote ? managers.remote?.workspaceOf?.(tab.label) : undefined);
      return {
        label: tab.label,
        cwd: managers.tab.cwdOf(tab.label) ?? managers.tab.launchDir,
        root: managers.tab.launchDir,
        ...(workspaceDir && { workspace: { dir: workspaceDir, offline: tab.offline ?? false } }),
        ...(tab.remote && { remote: true as const }),
      };
    },
    // The tab a dispatched line runs in. That is the tab answering when the host named one — a line
    // typed into a plugin tab's own command line runs in that tab — and the tab a command was invoked
    // from otherwise, which is all a command or selection action has. An answering tab that has since
    // closed falls back rather than addressing a label with no tab behind it, which would silently drop
    // the output on the floor.
    //
    // The command runs on the host's time, not the plugin's: it may be another plugin's command, a
    // large `open` or an agent launch, and a plugin must not be disabled for slowness that is not its
    // own. Only the wait is exempted — the plugin's work either side of it is still timed.
    dispatchLineWithOutput: (line) => {
      if (!isEnabled()) return Promise.resolve({ dispatched: false, output: '' });
      const answering = answeringLabel && managers.tab.byLabel(answeringLabel);
      const run = () => managers.command.dispatchLineWithOutput(answering ? answeringLabel : origin.label, line);
      return deadline ? deadline.exempt(run) : run();
    },
    completeLine: (line, cursor) => (isEnabled() ? complete(managers, line, cursor, answeringLabel ?? origin.label) : { matches: [], newInput: line, newCursor: cursor }),
    // Scoped to this plugin's own tabs rather than to whatever id it was handed. Pty ids come from a
    // plain counter, so an unscoped answer lets a plugin enumerate them and learn which other
    // processes in the window are alive — and the contract has always said "a terminal this plugin
    // spawned", which is the question asked here.
    terminalRunning: (ptyId) => isEnabled() && managers.pty.isRunningFor(ptyId, ownTabLabels()),
    // This plugin's own answering tab's queue, never another's: a line typed into a plugin tab's
    // command line waits in that tab, which is where the queue popup over it looks.
    queueLine: (line) => {
      const label = isEnabled() ? ownLineLabel() : undefined;
      if (label) managers.tab.enqueue(label, line);
    },
    nextQueuedLine: () => {
      const label = isEnabled() ? ownLineLabel() : undefined;
      return label ? managers.tab.dequeue(label) ?? null : null;
    },
    // This plugin's own answering tab's record only, for the same reason: a shell that changed
    // directory moves where its tab's next shell, file navigator and completion start, and no other tab's.
    recordCwd: (cwd) => {
      const label = isEnabled() ? ownLineLabel() : undefined;
      if (label) managers.tab.setCwd(label, cwd);
    },
    // Attributed to this plugin's own answering tab, as an agent tab's line is to that tab. The state
    // broadcast carries the global history, so it goes out again for ghost text to see the line.
    recordGlobalHistory: (line) => {
      const label = isEnabled() ? ownLineLabel() : undefined;
      const trimmed = line.trim();
      if (!label || !trimmed) return;
      recordGlobalHistory(trimmed, label);
      messageBus.emit('state', { type: 'dirty' });
    },
  };
}
