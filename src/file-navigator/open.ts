import { statSync } from 'node:fs';
import { buildCachedRows, clearFilesystemCache } from './filesystem-cache.js';
import { LocalFileSystemPort, type FileSystemPort } from './filesystem-port.js';
import { RemoteFileSystemPort } from './remote-port.js';
import type { Managers } from '../managers.js';
import type { RemoteTarget } from '../tab/types.js';
import type { BasePort } from './port.js';
import type { FilesTabState } from './state.js';

export interface OpenPort extends BasePort { managers: Managers }

function freshState(
  root: string, filesystem: FileSystemPort, remote?: RemoteTarget, ownerLabel?: string,
): FilesTabState {
  return {
    root, filesystem, remote, ownerLabel, expanded: new Set(), watchers: new Map(),
    listings: new Map(), listingLoads: new Set(), statLoads: new Set(),
    undoStack: [], redoStack: [], details: 'name', stats: new Map(),
  };
}

// The metadata-row folder button preserves the existing fresh-open/most-recent-retarget rule. A
// remote source swaps in a channel-backed port and ties the navigator to that source tab.
export function openOrRetarget(port: OpenPort, label: string): void {
  const source = port.managers.tab.tabs.find((tab) => tab.label === label);
  if (!source) return;
  const cwd = port.managers.tab.cwdOf(label) ?? process.cwd();
  const existing = port.managers.tab.mostRecentFileNavigatorLabel();
  if (source.remote) openRemote(port, label, source.remote, cwd, existing);
  else if (localDirectory(cwd)) openLocal(port, cwd, existing);
  port.managers.tab.setActiveTab(port.managers.tab.findIndex(label));
}

function localDirectory(root: string): boolean {
  try { return statSync(root).isDirectory(); } catch { return false; }
}

function openLocal(port: OpenPort, root: string, existing?: string): void {
  if (existing) {
    releaseRemote(port, existing);
    retarget(port, existing, root, new LocalFileSystemPort());
    return;
  }
  const state = freshState(root, new LocalFileSystemPort());
  port.managers.tab.openFilesTab({ root, absoluteRoot: root, rows: buildCachedRows(state, () => {}) });
  const label = port.managers.tab.cur().label;
  port.managers.tab.setCwd(label, root);
  port.states.set(label, state);
  port.watchDir(label, root, '');
  port.refreshGit(label);
  port.managers.tab.setDock(port.managers.tab.findIndex(label), 'left');
}

function openRemote(
  port: OpenPort, ownerLabel: string, remote: RemoteTarget, fallbackRoot: string, existing?: string,
): void {
  const ready = port.managers.remote.readyOf(ownerLabel);
  const channel = port.managers.remote.get(ownerLabel);
  if (!ready || !channel) return;
  const root = port.managers.remote.workspaceOf(ownerLabel) ?? fallbackRoot;
  if (existing) {
    if (port.states.get(existing)?.ownerLabel === ownerLabel) return;
    releaseRemote(port, existing);
    if (!port.managers.remote.attach(existing, ownerLabel)) return;
    const filesystem = new RemoteFileSystemPort(channel, existing, ready);
    retarget(port, existing, root, filesystem, remote, ownerLabel);
    updateRemoteRoot(port, existing, ready);
    return;
  }
  port.managers.tab.openFilesTab({ root, absoluteRoot: root, rows: [], waitingFor: root, remote });
  const label = port.managers.tab.cur().label;
  if (!port.managers.remote.attach(label, ownerLabel)) return;
  const state = freshState(root, new RemoteFileSystemPort(channel, label, ready), remote, ownerLabel);
  port.managers.tab.setCwd(label, root);
  port.states.set(label, state);
  port.watchDir(label, root, '');
  port.refreshGit(label);
  port.managers.tab.setDock(port.managers.tab.findIndex(label), 'left');
  updateRemoteRoot(port, label, ready);
}

function updateRemoteRoot(port: OpenPort, label: string, ready: Promise<string>): void {
  void ready.then((root) => {
    const state = port.states.get(label);
    if (!state?.remote) return;
    state.remoteRoot = root;
    if (state.root !== root) {
      port.unwatchDir(state, '');
      state.root = root;
      clearFilesystemCache(state);
      state.listingLoads.clear();
      state.statLoads.clear();
      port.watchDir(label, root, '');
    }
    if (port.managers.tab.tabs.some((tab) => tab.label === label)) port.managers.tab.setCwd(label, root);
    port.rebuild(label);
  }, () => {});
}

function releaseRemote(port: OpenPort, label: string): void {
  const state = port.states.get(label);
  if (!state?.remote) return;
  state.filesystem.dispose();
  port.managers.remote.release(label);
}

function retarget(
  port: OpenPort, label: string, root: string, filesystem: FileSystemPort,
  remote?: RemoteTarget, ownerLabel?: string,
): void {
  const state = port.states.get(label);
  if (!state) return;
  for (const relPath of state.expanded) port.unwatchDir(state, relPath);
  state.expanded.clear();
  port.unwatchDir(state, '');
  if (!state.remote) state.filesystem.dispose();
  state.root = root;
  state.filesystem = filesystem;
  state.remote = remote;
  state.ownerLabel = ownerLabel;
  state.undoStack = [];
  state.redoStack = [];
  state.listings.clear();
  state.listingLoads.clear();
  state.statLoads.clear();
  state.stats.clear();
  port.watchDir(label, root, '');
  port.refreshGit(label);
  if (port.managers.tab.tabs.some((tab) => tab.label === label)) port.managers.tab.setCwd(label, root);
  port.rebuild(label);
}
