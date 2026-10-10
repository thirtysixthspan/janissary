import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';
import type { HandlerDeadline } from './guard.js';
import { complete } from '../controller/completion.js';
import { recordGlobalHistory } from '../global-history.js';
import { messageBus } from '../bus.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';
import { ownTabLabel } from './own-tab.js';

// The capabilities that make a plugin tab a place a line can be typed and a process can be checked
// on: where it is, which tab a line runs in, what output that line produces, what the application
// would complete it to, and whether the terminal behind it is still alive. They are one group because they are one pull request's
// worth of additions, because each exists for the same reason — a plugin tab is not a shell tab, so it
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
  // The labels of this plugin's own open tabs — the only terminals whose ids a plugin can legitimately
  // hold, because a payload factory is the only scope in which it may start one.
  const ownTabLabels = () => managers.tab.tabs
    .filter((tab) => tab.plugin?.id === declaration.id)
    .map((tab) => tab.label);
  return {
    originTab: (label?: string) => {
      if (!isEnabled()) return null;
      // No label: the tab answering when the host named one, the tab a command came from otherwise —
      // which is what every caller without an argument has always read. With one: that open tab,
      // resolved the way a command naming a tab by typed name resolves it, so a plugin asks about a
      // tab it was not invoked from without reading the host's tab list.
      const tab = label === undefined
        ? managers.tab.byLabel(answeringLabel ?? origin.label)
        : managers.tab.byLabelOrAlias(label);
      // The launch shell has no tab to come from, so it starts where a new tab does: the project root.
      if (!tab && origin.launch && label === undefined) {
        return { label: origin.label, cwd: managers.tab.launchDir, root: managers.tab.launchDir };
      }
      if (!tab) return null;
      // A remote tab holds no local directory — the clone lives on the far side and its removal is
      // that host's business — so the workspace the question is about is read from the session.
      const workspaceDir = tab.workspaceDir ?? (tab.remote ? managers.remote?.workspaceOf?.(tab.label) : undefined);
      // Whether the workspace named has landed. A local clone's directory is known the moment its
      // tab opens, so the path alone cannot answer it, and a command that names a workspace still
      // being cloned has a wait to report rather than a directory to read. A remote tab's directory
      // is the channel's own, undefined until the far side answers — which is the wait to report,
      // read the same way `buildTabView` reads it for the metadata row's spinner.
      const provisioning = workspaceDir === undefined
        ? (tab.remote !== undefined && managers.remote?.workspaceOf?.(tab.label) === undefined)
        : managers.workspace?.provisioning?.(workspaceDir) ?? false;
      return {
        label: tab.label,
        cwd: managers.tab.cwdOf(tab.label) ?? managers.tab.launchDir,
        root: managers.tab.launchDir,
        // Which kind of tab this is, and which plugin owns it when it is one. The workspace a
        // command may ask about belongs to a shell or a harness tab, and both are shaped by what
        // they are rather than by anything the record's other fields read — so a caller that is
        // allowed to serve one of the two and not the rest is told which of them it holds.
        ...(tab.view !== undefined && { view: tab.view }),
        ...(tab.plugin?.id !== undefined && { plugin: tab.plugin.id }),
        ...(workspaceDir && { workspace: { dir: workspaceDir, offline: tab.offline ?? false } }),
        ...(tab.remote && { remote: true as const }),
        ...(provisioning && { provisioning: true as const }),
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
    // command line waits in that tab, which is where the queue popup over it looks. A queue aimed at
    // a tab this plugin does not own is refused rather than dropped, so the transcript says which
    // call was turned away.
    queueLine: (line) => {
      if (!isEnabled()) return;
      const label = ownTabLabel({ managers, declaration, origin, answeringLabel }, 'This plugin has no open tab to queue a line in.');
      managers.tab.enqueue(label, line);
    },
    nextQueuedLine: () => {
      if (!isEnabled()) return null;
      const label = ownTabLabel({ managers, declaration, origin, answeringLabel }, 'This plugin has no open tab to take a queued line from.');
      return managers.tab.dequeue(label) ?? null;
    },
    // This plugin's own answering tab's record only, for the same reason: a shell that changed
    // directory moves where its tab's next shell, file navigator and completion start, and no other tab's.
    recordCwd: (cwd) => {
      if (!isEnabled()) return;
      const label = ownTabLabel({ managers, declaration, origin, answeringLabel }, 'This plugin has no open tab to record a directory in.');
      managers.tab.setCwd(label, cwd);
    },
    // Attributed to this plugin's own answering tab, as a shell tab's line is to that tab. The state
    // broadcast carries the global history, so it goes out again for ghost text to see the line.
    recordGlobalHistory: (line) => {
      if (!isEnabled()) return;
      const label = ownTabLabel({ managers, declaration, origin, answeringLabel }, 'This plugin has no open tab to record a line in.');
      const trimmed = line.trim();
      if (!trimmed) return;
      recordGlobalHistory(trimmed, label);
      messageBus.emit('state', { type: 'dirty' });
    },
  };
}
