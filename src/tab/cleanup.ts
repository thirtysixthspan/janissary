import { messageBus } from '../bus.js';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';

export function closeTabResources(
  tab: Tab,
  managers: Managers,
  openFiles: Map<string, string>,
  context: Map<string, string[]>,
  queue: Map<string, string[]>,
  tabsLength: number,
): void {
  // Remove the workspace clone in the background: it is a recursive rmSync of a full git clone,
  // slow enough to freeze the UI if run inline (the tab can't visibly close until it finishes).
  // Deferring it lets the tab close and the state broadcast reach the client first. The clone stays
  // tracked until `remove` runs, so a shutdown before this fires still cleans it up via removeAll().
  if (tab.workspaceDir) {
    const workspaceDir = tab.workspaceDir;
    setTimeout(() => managers.workspace.remove(workspaceDir), 0);
  }
  managers.shell.close(tab.label);
  managers.acp.close(tab.label);
  managers.browser.closeTab(tab.label);
  managers.pty.closeTab(tab.label);
  managers.tab.deleteBusy(tab.label);
  managers.fileTree.closeTab(tab.label);
  managers.editorWatch.closeTab(tab.label);
  managers.schedule.delete(tab.label);
  managers.database.forgetTab(tab.label);
  if (tabsLength <= 1) managers.database.closeAll();
  messageBus.emit('transcript', { type: 'tab:removed', tabLabel: tab.label });
  if (tab.image) {
    const id = tab.image.url.replace(/^\/open\//, '');
    openFiles.delete(id);
  }
  if (tab.markdown) {
    const id = tab.markdown.url.replace(/^\/open\//, '');
    openFiles.delete(id);
  }
  context.delete(tab.label);
  queue.delete(tab.label);
}
