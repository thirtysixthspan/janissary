import type { Managers } from '../managers.js';
import type { RemoteProcessState } from '../remote/protocol-frames.js';
import { uniqueLabel } from '../tab/utils.js';
import type { RemoteSessionRecord } from './store.js';

// Rebuilding the tabs of an attached session from the peer's own answer. The launching tab already
// exists by the time this runs — it is the placeholder ssh's prompts rendered in — so what is left
// is every *other* process the far side reported still running.

// An attached tab takes its recorded label back, de-duplicated if something else has claimed it
// meanwhile. The remote workspace directory is named after the original label, so reusing it keeps
// the tab and its far-side clone agreeing about what they are.
function claimLabel(managers: Managers, recorded: string): string {
  return uniqueLabel(managers.tab.tabs, recorded);
}

/**
 * Open one tab per far-side process the launching tab does not already stand for, restoring the
 * group rather than a single representative tab.
 *
 * Remote file navigators are deliberately not restored: a navigator is a view onto a workspace that
 * is coming back anyway, and reopening one the user did not ask for would put a tree on screen
 * beside every attached session.
 *
 * Anything still held for a process no tab was built for is discarded once this returns, so a peer
 * describing something this side chose not to restore does not leave its replay in memory for the
 * life of the channel.
 */
export async function restoreSessionTabs(
  managers: Managers, record: RemoteSessionRecord, launchLabel: string,
  processes: readonly RemoteProcessState[],
): Promise<string[]> {
  const restored: string[] = [];
  for (const process of processes) {
    if (!process.shell) continue;
    const recorded = record.processes.find((entry) => entry.id === process.id && entry.kind === 'shell');
    if (!recorded?.shell || recorded.cwd === undefined || recorded.offline === undefined) continue;
    const label = claimLabel(managers, recorded.label);
    await managers.plugins.reattach('shell', {
      label, nonce: recorded.shell.nonce, cwd: recorded.cwd, workspace: record.workspaceDir,
      offline: recorded.offline, host: record.host, ptyId: recorded.id,
    }, { label: launchLabel, command: '' });
    if (managers.tab.byLabel(label)) restored.push(label);
  }
  managers.remote.get(launchLabel)?.discardUnclaimed();
  return restored;
}
