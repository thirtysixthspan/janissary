import type { Managers } from '../managers.js';
import { placeAgent } from '../profile/place-agent.js';
import type { RemoteProcessState } from '../remote/protocol.js';
import { uniqueLabel } from '../tab/index.js';
import type { RemoteSessionRecord } from './store.js';

// Rebuilding the tabs of a reattached session from the peer's own answer. The launching tab already
// exists by the time this runs — it is the placeholder ssh's prompts rendered in — so what is left
// is every *other* process the far side reported still running.

// A reattached tab takes its recorded label back, de-duplicated if something else has claimed it
// meanwhile. The remote workspace directory is named after the original label, so reusing it keeps
// the tab and its far-side clone agreeing about what they are.
function claimLabel(managers: Managers, recorded: string): string {
  return uniqueLabel(managers.tab.tabs, recorded);
}

// An agent tab's shell is created lazily, on its first command, so the recorded spawn id is parked
// on `ShellManager` rather than handed to a constructor: when the shell is finally asked for, it
// binds to the one still running out there instead of starting a second beside it.
function restoreAgentTab(
  managers: Managers, launchLabel: string, recordedLabel: string, spawnId: string, workspace: string,
): string | undefined {
  const label = claimLabel(managers, recordedLabel);
  const creator = managers.tab.byLabel(launchLabel);
  if (!creator?.remote) return;
  if (!managers.remote.attach(label, launchLabel)) return;
  managers.shell.adoptRemoteShell(label, spawnId);
  placeAgent(managers, {
    resolved: label, creator, cwd: workspace, offline: false, remote: creator.remote,
  });
  return label;
}

/**
 * Open one tab per far-side process the launching tab does not already stand for, restoring the
 * group rather than a single representative tab.
 *
 * Remote file navigators are deliberately not restored: a navigator is a view onto a workspace that
 * is coming back anyway, and reopening one the user did not ask for would put a tree on screen
 * beside every reattached session.
 *
 * Anything still held for a process no tab was built for is discarded once this returns, so a peer
 * describing something this side chose not to restore does not leave its replay in memory for the
 * life of the channel.
 */
export function restoreSessionTabs(
  managers: Managers, record: RemoteSessionRecord, launchLabel: string,
  processes: readonly RemoteProcessState[],
): string[] {
  const restored: string[] = [];
  for (const process of processes) {
    // The harness the launching tab is already running, and any PTY takeover or inline terminal card
    // riding a tab that is itself being restored: neither is a row, and neither is a tab of its own.
    if (process.harness !== undefined || process.mode !== 'pipe') continue;
    const recorded = record.processes.find((entry) => entry.id === process.id);
    const recordedLabel = recorded?.label ?? process.agentName;
    if (recordedLabel === undefined || recordedLabel === record.launchLabel) continue;
    const label = restoreAgentTab(managers, launchLabel, recordedLabel, process.id, record.workspaceDir);
    if (label !== undefined) restored.push(label);
  }
  managers.remote.get(launchLabel)?.discardUnclaimed();
  return restored;
}
