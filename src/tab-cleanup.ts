import { messageBus } from './bus.js';
import type { Tab } from './types.js';
import type { Managers } from './managers.js';

export function closeTabResources(
  tab: Tab,
  managers: Managers,
  openFiles: Map<string, string>,
  context: Map<string, string[]>,
  queue: Map<string, string[]>,
  tabsLength: number,
): void {
  if (tab.workspaceDir) managers.workspace.remove(tab.workspaceDir);
  managers.shell.close(tab.label);
  managers.acp.close(tab.label);
  managers.browser.closeTab(tab.label);
  managers.pty.closeTab(tab.label);
  managers.fileTree.closeTab(tab.label);
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
