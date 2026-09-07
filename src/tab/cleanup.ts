import { messageBus } from '../bus.js';
import type { Tab } from './types.js';
import type { Managers } from '../managers.js';
import { deleteAgentState } from '../agent/state.js';
import { TranscriptStore } from '../transcript/store.js';
import { releaseFileReference } from './file-registry.js';

export function closeTabResources(
  tab: Tab,
  managers: Managers,
  openFiles: Map<string, string>,
  contextOrTabsLength: Map<string, string[]> | number,
  queue?: Map<string, string[]>,
  legacyTabsLength?: number,
): void {
  const tabsLength = typeof contextOrTabsLength === 'number' ? contextOrTabsLength : legacyTabsLength ?? 0;
  // Release the workspace clone in the background: its final release recursively removes a full git clone,
  // slow enough to freeze the UI if run inline (the tab can't visibly close until it finishes).
  // Deferring it lets the tab close and the state broadcast reach the client first. The clone stays
  // tracked until `release` runs, so a shutdown before this fires still cleans it up via removeAll().
  if (tab.workspaceDir) {
    const workspaceDir = tab.workspaceDir;
    // If the clone is still being provisioned (the tab was closed before it finished), cancel it
    // immediately — a no-op once nothing is pending for this label — so the tab closes right away
    // instead of leaving an orphaned `git clone` running for a tab that no longer exists.
    managers.workspace.cancel(tab.label);
    setTimeout(() => managers.workspace.release(workspaceDir), 0);
  }
  managers.shell.close(tab.label);
  managers.acp.close(tab.label);
  managers.editorAcp.closeTab(tab.label);
  managers.browser.closeTab(tab.label);
  if (tab.remote) managers.remote?.release(tab.label);
  managers.pty.closeTab(tab.label);
  managers.tab.deleteBusy(tab.label);
  managers.fileNavigator.closeTab(tab.label);
  managers.editorWatch.closeTab(tab.label);
  managers.schedule.delete(tab.label);
  managers.questions.cancelTab(tab.label);
  managers.database.forgetTab(tab.label);
  // A closed tab is not restored on the next `--relaunch`. The label is refused first and the files
  // removed after, so a write arriving from an async callback in between — a shell command finishing
  // after its tab closed, the schedule tick — cannot recreate what is about to be deleted. Quitting
  // takes a different path and keeps persisting everything still open.
  managers.tab.forgetPersisted(tab.label);
  deleteAgentState(tab.label);
  TranscriptStore.remove(tab.label);
  if (tabsLength <= 1) managers.database.closeAll();
  messageBus.emit('transcript', { type: 'tab:removed', tabLabel: tab.label });
  if (tab.plugin) {
    for (const id of tab.plugin.fileRefs) openFiles.delete(id);
  }
  if (tab.editor) releaseFileReference(openFiles, tab.editor.url);
  if (typeof contextOrTabsLength !== 'number') contextOrTabsLength.delete(tab.label);
  queue?.delete(tab.label);
}
