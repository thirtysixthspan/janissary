import { watch, statSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { messageBus } from './bus.js';
import { buildRows } from './file-tree.js';
import type { Managers } from './managers.js';

const DEBOUNCE_MS = 100;

// Per files-tab state, keyed by the tab's label. `watchers` is keyed by each visible directory's
// tree-relative path ('' for the root itself).
type FilesTabState = {
  root: string;
  expanded: Set<string>;
  watchers: Map<string, FSWatcher>;
  debounce?: ReturnType<typeof setTimeout>;
};

// Owns file tree tabs: opening/focusing them, their `expanded` directory sets, and one
// non-recursive `fs.watch` per visible directory. Any watch event schedules a single per-tab
// debounced rebuild; the server always owns the tree — the client only ever renders rows.
export class FileTreeManager {
  private tabs = new Map<string, FilesTabState>();

  constructor(private managers: Managers) {}

  // Handle a `files [path]` command: open a new tree tab rooted at `path` (or the issuing tab's
  // cwd), or focus the existing tab if one is already open on that root.
  open(command: string, label: string): void {
    const target = command.replace(/^files\b\s*/i, '').trim();
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const root = target ? (path.isAbsolute(target) ? target : path.resolve(cwd, target)) : cwd;
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });

    let stat;
    try { stat = statSync(root); } catch { stat = undefined; }
    if (!stat?.isDirectory()) { out(`files: ${root}: not a directory`); return; }

    const existing = this.managers.tab.tabs.find((t) => t.files?.root === root);
    if (existing) { this.managers.tab.setActiveTab(this.managers.tab.findIndex(existing.label)); return; }

    const expanded = new Set<string>();
    this.managers.tab.openFilesTab({ root, rows: buildRows(root, expanded) });
    const newLabel = this.managers.tab.cur().label;
    this.managers.tab.setCwd(newLabel, root);
    this.tabs.set(newLabel, { root, expanded, watchers: new Map() });
    this.watchDir(newLabel, root, '');
  }

  // Expand/collapse one directory row.
  toggle(label: string, relPath: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.expanded.has(relPath)) {
      state.expanded.delete(relPath);
      this.unwatchDir(state, relPath);
    } else {
      state.expanded.add(relPath);
      this.watchDir(label, path.join(state.root, relPath), relPath);
    }
    this.rebuild(label);
  }

  // Collapse every expanded directory back to just the root.
  collapseAll(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    for (const relPath of state.expanded) this.unwatchDir(state, relPath);
    state.expanded.clear();
    this.rebuild(label);
  }

  // Tear down one tab's watchers and debounce timer (on tab close).
  closeTab(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    for (const watcher of state.watchers.values()) { try { watcher.close(); } catch { /* already gone */ } }
    this.tabs.delete(label);
  }

  // Tear down every tab's watchers (app shutdown).
  dispose(): void {
    for (const label of this.tabs.keys()) this.closeTab(label);
  }

  private watchDir(label: string, absDir: string, relPath: string): void {
    const state = this.tabs.get(label);
    if (!state || state.watchers.has(relPath)) return;
    try {
      state.watchers.set(relPath, watch(absDir, () => this.scheduleRebuild(label)));
    } catch {
      // Exotic filesystems, fd limits, races — the tree still works, just refreshes on toggle.
    }
  }

  private unwatchDir(state: FilesTabState, relPath: string): void {
    const watcher = state.watchers.get(relPath);
    if (!watcher) return;
    try { watcher.close(); } catch { /* already gone */ }
    state.watchers.delete(relPath);
  }

  private scheduleRebuild(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => this.rebuild(label), DEBOUNCE_MS);
  }

  // Prune expanded directories that no longer exist (closing their watchers), rebuild the visible
  // row list, and write it onto the tab's payload.
  private rebuild(label: string): void {
    const state = this.tabs.get(label);
    if (!state) return;
    for (const relPath of state.expanded) {
      let stillDir: boolean;
      try { stillDir = statSync(path.join(state.root, relPath)).isDirectory(); } catch { stillDir = false; }
      if (!stillDir) { state.expanded.delete(relPath); this.unwatchDir(state, relPath); }
    }
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.files) return;
    tab.files = { root: state.root, rows: buildRows(state.root, state.expanded) };
    messageBus.emit('state', { type: 'dirty' });
  }
}
