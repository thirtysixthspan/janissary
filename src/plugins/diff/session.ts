import type { TabPluginServerCapabilities } from '../api.js';
import { readChangeSet } from './change-set.js';
import { readRemoteChangeSet } from './remote-change-set.js';
import { DiffTab, type ChangeSetReader, type DiffOrigin } from './tab-state.js';

// The state the whole plugin holds between calls: one diff tab per workspace it has been asked about,
// plus the layout they all open with. Kept beside `activate.ts` because it is the plugin's whole
// lifetime — `dispose` has to reach it — while `activate.ts` is about wiring handlers.
//
// Two keyspaces, because there are two kinds of diff. The project-root diff is one tab: `diff` and
// `diff <path>` focus and re-scope the same one, the way they always have. A workspace diff is one
// tab per workspace directory, so two routes for the same workspace find the same tab rather than
// opening a second one — the metadata row's ➕ means two shell tabs can share one clone, and the two
// are looking at the same thing.

const ROOT_KEY = 'diff';
const WORKSPACE_KEY_PREFIX = 'workspace:';
const ROOT_TITLE = 'diff';
const TAB_TITLE_PREFIX = 'diff on ';

// The instance key a workspace diff is addressed by: the directory rather than the tab that opened
// it, so a second tab sharing the clone finds the diff tab that is already showing it.
export function workspaceKey(root: string): string {
  return `${WORKSPACE_KEY_PREFIX}${root}`;
}

// Where a workspace came from, which is what its tab is named after.
export type WorkspaceOrigin = { tab: string; root: string; workspace: { dir: string } } & (
  { host: string } | { host?: undefined }
);

// How a change set is read where the repository is. The local reader is handed the directory on every
// read, so a re-scoped tab reads the directory it now shows; the remote one ignores it, because a peer
// has one workspace and the far side already knows which.
function localReader(): ChangeSetReader {
  return (root, _capabilities, fullFiles) => readChangeSet(root, fullFiles);
}

function remoteReader(): ChangeSetReader {
  return (_root, capabilities, fullFiles) => readRemoteChangeSet(capabilities, fullFiles);
}

export class DiffSession {
  private tabs = new Map<string, DiffTab>();
  // The layout as last read from or written to the settings entry, so a session that never changes
  // it does not rewrite the config, and a write the file refused is retried by the next change.
  private split = false;
  private savedSplit = false;

  constructor(private capabilities: TabPluginServerCapabilities) {
    const saved = capabilities.readSettings().split;
    if (typeof saved === 'boolean') {
      this.split = saved;
      this.savedSplit = saved;
    }
  }

  // The project-root diff: one tab, re-scoped in place, titled `diff`.
  open(root: string, origin: DiffOrigin): void {
    if (root === '') return;
    const tab = this.tabFor(ROOT_KEY, root, origin, { title: ROOT_TITLE, read: localReader() });
    tab.open(root, origin);
  }

  // A workspace diff on this machine: one tab per clone, opened with `openOrFocusTab`.
  openWorkspace(origin: WorkspaceOrigin): void {
    if (origin.workspace.dir === '') return;
    const key = workspaceKey(origin.workspace.dir);
    const tab = this.tabFor(key, origin.workspace.dir, origin, {
      title: `${TAB_TITLE_PREFIX}${origin.tab}`, read: localReader(), workspace: true,
    });
    tab.open(origin.workspace.dir, origin);
  }

  // A workspace diff on another host. The tab joins that tab's channel, which is what holds the
  // session and its workspace open for as long as the diff tab is, and reads through it. `launchTab`
  // never focuses an existing tab, so a workspace whose diff tab is already open is focused here
  // instead of joined a second time.
  openRemoteWorkspace(origin: WorkspaceOrigin, sourceLabel: string): void {
    if (origin.workspace.dir === '') return;
    const key = workspaceKey(origin.workspace.dir);
    const existing = this.tabs.get(key);
    if (existing) {
      this.capabilities.openOrFocusTab(key, () => ({ title: existing.title, payload: existing.opening() }));
      return;
    }
    const remote = { title: `${TAB_TITLE_PREFIX}${origin.tab}`, read: remoteReader(), workspace: true };
    this.capabilities.launchTab(
      key,
      { remote: { join: true, label: sourceLabel } },
      (resources, start) => {
        const tab = this.tabFor(key, start.workspaceDir ?? origin.workspace.dir, origin, {
          ...remote, ...(start.host !== undefined && { host: start.host }),
        });
        return { title: tab.title, payload: tab.opening() };
      },
      () => { void this.tabs.get(key)?.refresh(this.capabilities); },
    );
  }

  async refresh(key: string, capabilities: TabPluginServerCapabilities): Promise<void> {
    await this.tabs.get(key)?.refresh(capabilities);
  }

  setFullFile(key: string, relPath: string, fullFile: boolean): void {
    this.tabs.get(key)?.setFullFile(relPath, fullFile);
  }

  openFile(key: string, relPath: string, line: number): void {
    this.tabs.get(key)?.openFile(relPath, line);
  }

  openMedia(key: string, relPath: string): void {
    this.tabs.get(key)?.openMedia(relPath);
  }

  // The layout the user chose, remembered in this plugin's settings entry so every diff tab after
  // this one opens with it. A choice already saved writes nothing: the layout is a standing
  // preference rather than something a repaint rewrites, and a write the file refused is retried by
  // the next change.
  saveLayout(split: boolean): void {
    this.split = split;
    if (split !== this.savedSplit && this.capabilities.saveSettings({ split })) this.savedSplit = split;
    for (const tab of this.tabs.values()) tab.layout(split);
  }

  dispose(): void {
    for (const tab of this.tabs.values()) tab.dispose();
    this.tabs.clear();
  }

  private tabFor(
    key: string, root: string, origin: DiffOrigin,
    start: { title: string; read: ChangeSetReader; host?: string; workspace?: boolean },
  ): DiffTab {
    const existing = this.tabs.get(key);
    if (existing) return existing;
    const created = new DiffTab(key, start.title, root, origin, start.read, this.capabilities, {
      split: this.split, ...(start.host !== undefined && { host: start.host }), ...(start.workspace === true && { workspace: true }),
    });
    this.tabs.set(key, created);
    return created;
  }
}
