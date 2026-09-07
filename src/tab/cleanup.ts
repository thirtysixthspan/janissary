import { messageBus } from '../bus.js';
import type { Tab } from './types.js';
import { MANAGER_DISPOSE_ORDER, type TabReleasingManager, type Managers } from '../managers.js';
import { releaseFileReference } from './file-registry.js';
import { deleteAgentState } from '../agent/state.js';
import { TranscriptStore } from '../transcript/store.js';

// The managers whose per-tab release the walk below performs through their own `closeTab` method.
// `workspace` is released only through the deferred block above the walk, `tab` orchestrates this
// whole file, and `database`'s last-tab close is a separate end-of-walk decision — so those three
  // the walk and stated explicitly around it instead.
export function closeTabResources(
  tab: Tab,
  managers: Managers,
  openFiles: Map<string, string>,
  nonDockedCount: number,
): void {
  const label = tab.label;
  // Release the workspace clone in the background: its final release recursively removes a full git clone,
  // slow enough to freeze the UI if run inline (the tab can't visibly close until it finishes).
  // Deferring it lets the tab close and the state broadcast reach the client first. The clone stays
  // tracked until `release` runs, so a shutdown before this fires still cleans it up via removeAll().
  if (tab.workspaceDir) {
    const workspaceDir = tab.workspaceDir;
    // If the clone is still being provisioned (the tab was closed before it finished), cancel it
    // immediately — a no-op once nothing is pending for this label — so the tab closes right away
    // instead of leaving an orphaned `git clone` running for a tab that no longer exists.
    managers.workspace.cancel(label);
    setTimeout(() => managers.workspace.release(workspaceDir), 0);
  }
  for (const name of MANAGER_DISPOSE_ORDER) {
    if (name === 'workspace' || name === 'tab') continue;
    if (name === 'remote' && !tab.remote) continue;
    (managers[name] as unknown as TabReleasingManager | undefined)?.closeTab?.(label);
  }
  managers.tab.deleteBusy(label);
  // A closed tab is not restored on the next `--relaunch`. The label is refused first and the files
  // removed after, so a write arriving from an async callback in between — a shell command finishing
  // after its tab closed, the schedule tick — cannot recreate what is about to be deleted. Quitting
  // takes a different path and keeps persisting everything still open.
  managers.tab.forgetPersisted(label);
  deleteAgentState(label);
  TranscriptStore.remove(label);
  if (nonDockedCount <= 1) managers.database.closeAll();
  messageBus.emit('transcript', { type: 'tab:removed', tabLabel: label });
  if (tab.plugin) {
    for (const id of tab.plugin.fileRefs) openFiles.delete(id);
  }
  if (tab.editor) releaseFileReference(openFiles, tab.editor.url);
}
