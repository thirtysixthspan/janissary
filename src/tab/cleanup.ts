import { tabRuntime } from './runtime.js';
import { messageBus } from '../bus.js';
import type { Tab } from './types.js';
import { MANAGER_TAB_RELEASE, type Managers } from '../managers.js';
import { releaseFileReference } from './file-registry.js';
import { releasePluginRemoteResource } from '../plugins/remote-capabilities.js';

// The walk covers exactly the managers named in `MANAGER_TAB_RELEASE` — the declared list beside
// `MANAGER_DISPOSE_ORDER`. `workspace` is released only through the deferred block below and `tab`
// orchestrates this whole file, so those two are handled outside the per-tab release list and stated
// explicitly around it instead. SQLite connections are global, not per-tab: they close at shutdown,
// which is also how closing the last non-docked tab closes them, since that close exits instead of
// reaching this walk.
export async function closeTabResources(
  tab: Tab,
  managers: Managers,
  openFiles: Map<string, string>,
): Promise<void> {
  const label = tab.label;
  const releases: Promise<void>[] = [];
  const failures: unknown[] = [];
  const attempt = (release: () => void): void => {
    try { release(); } catch (error) { failures.push(error); }
  };
  tabRuntime(tab).closing = true;
  attempt(() => releasePluginRemoteResource(label));
  // Release the workspace clone in the background: its final release recursively removes a full git clone,
  // slow enough to freeze the UI if run inline (the tab can't visibly close until it finishes).
  // Deferring it lets the tab close and the state broadcast reach the client first. The clone stays
  // tracked until `release` runs, so a shutdown before this fires still cleans it up via removeAll().
  if (tab.workspaceDir) {
    const workspaceDir = tab.workspaceDir;
    // If the clone is still being provisioned (the tab was closed before it finished), cancel it
    // immediately — a no-op once nothing is pending for this label — so the tab closes right away
    // instead of leaving an orphaned `git clone` running for a tab that no longer exists.
    attempt(() => {
      if (tab.workspaceCancel) tab.workspaceCancel();
      else managers.workspace.cancel(label);
    });
    const release = new Promise<void>((resolve) => {
      setTimeout(async () => {
        try {
          await managers.workspace.release(workspaceDir);
        } catch (error) {
          failures.push(error);
        } finally {
          resolve();
        }
      }, 0);
    });
    releases.push(release);
  }
  for (const name of MANAGER_TAB_RELEASE) {
    if (name === 'remote' && !tab.remote) continue;
    attempt(() => managers[name].closeTab(label));
  }
  attempt(() => managers.tab.deleteBusy(label));
  attempt(() => {
    const listenerFailures = messageBus.emit('transcript', { type: 'tab:removed', tabLabel: label });
    for (const error of listenerFailures) failures.push(error);
  });
  if (tab.plugin) {
    for (const id of tab.plugin.fileRefs) attempt(() => { openFiles.delete(id); });
  }
  const editor = tab.editor;
  if (editor) attempt(() => releaseFileReference(openFiles, editor.url));
  await Promise.all(releases);
  if (failures.length > 0) throw new AggregateError(failures, `Closing tab "${label}" failed.`);
}
