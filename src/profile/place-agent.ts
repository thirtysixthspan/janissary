import { makeTab, distinctColor } from '../tab/index.js';
import type { Tab, RemoteTarget } from '../tab/types.js';
import type { Managers } from '../managers.js';

// The agent-tab creation body, shared by `newAgent` (active tab as creator), `newAgentAt` (a
// label-resolved source tab that may be docked and not active), and the remote launch path.
// Grouped into one options object rather than a long positional list — several fields share a type.
export type PlaceAgentOptions = {
  resolved: string;
  creator: Tab | undefined;
  cwd: string;
  workspaceDir?: string;
  offline: boolean;
  // Marks the tab busy on creation (a launch still waiting on its clone or its ssh channel).
  // Everything typed in the meantime queues through the ordinary busy-tab command queue.
  busy?: boolean;
  // Set for an `on <address>` launch. `workspaceDir` deliberately stays undefined alongside it: the
  // clone is the remote's, and so is its removal.
  remote?: RemoteTarget;
  // Set by a profile launch, which takes its colors and group from the profile rather than from a
  // creator tab.
  presentation?: { dotColor: string; group: number; groupColor: string };
};

// Build the agent tab, insert it into its creator's group, set its cwd, focus it, and persist.
export function placeAgent(managers: Managers, options: PlaceAgentOptions): void {
  const { resolved, creator, cwd, workspaceDir, offline, busy, remote, presentation } = options;
  const dotColor = presentation?.dotColor ?? distinctColor(managers.tab.tabs.map((t) => t.dotColor));
  const group = presentation?.group ?? creator?.group ?? 1;
  const groupColor = presentation?.groupColor ?? creator?.groupColor ?? dotColor;
  const tab = makeTab(resolved, dotColor, managers.tab.tabs.length + 1, [], [], workspaceDir, group, groupColor);
  tab.toolStepsExpanded = false;
  tab.offline = offline;
  if (remote) tab.remote = remote;
  managers.tab.insertTabInGroup(tab);
  managers.tab.setCwd(resolved, cwd);
  if (busy) managers.tab.addBusy(resolved);
  managers.tab.setActiveTab(managers.tab.findIndex(resolved));
  managers.tab.persist(managers.tab.buildAgentState(tab));
}
