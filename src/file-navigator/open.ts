import { statSync } from 'node:fs';
import { buildCachedRows, clearFilesystemCache } from './filesystem-cache.js';
import { LocalFileSystemPort, type FileSystemPort } from './filesystem-port.js';
import { RemoteFileSystemPort } from './remote/port.js';
import { forgetRemoteFilesOf } from './remote/file-cache.js';
import type { Managers } from '../managers.js';
import type { RemoteTarget } from '../tab/types.js';
import { dropExpandedWatchers, reRootTree } from './navigation.js';
import type { BasePort } from './port.js';
import { freshFileNavigatorState, type FilesTabState } from './state.js';

export interface OpenPort extends BasePort { managers: Managers }

// The metadata-row folder button preserves the existing fresh-open/most-recent-retarget rule. A
// remote source swaps in a channel-backed port and ties the navigator to that source tab.
export function openOrRetarget(port: OpenPort, label: string): void {
  const source = port.managers.tab.byLabel(label);
  if (!source) return;
  const cwd = port.managers.tab.cwdOf(label) ?? port.managers.tab.launchDir;
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
  const state = freshFileNavigatorState(root, new LocalFileSystemPort());
  port.managers.tab.openFilesTab({ root, absoluteRoot: root, rows: buildCachedRows(state, () => {}) });
  const label = port.managers.tab.cur().label;
  registerOpenedTab(port, label, root, state);
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
  const state = freshFileNavigatorState(root, new RemoteFileSystemPort(channel, label, ready), 'name', remote, ownerLabel);
  registerOpenedTab(port, label, root, state);
  updateRemoteRoot(port, label, ready);
}

// The steps every freshly opened navigator tab shares, once its state and label exist.
function registerOpenedTab(port: OpenPort, label: string, root: string, state: FilesTabState): void {
  port.managers.tab.setCwd(label, root);
  port.states.set(label, state);
  port.watchDir(label, root, '');
  port.refreshGit(label);
  port.managers.tab.setDock(port.managers.tab.findIndex(label), 'left');
}

function updateRemoteRoot(port: OpenPort, label: string, ready: Promise<string>): void {
  void ready.then((root) => {
    const state = port.states.get(label);
    if (!state?.remote) return;
    state.remoteRoot = root;
    // A root that moves takes the full re-root sequence — the git half included, so the workspace's
    // own branch and statuses are read rather than the fallback root's staying on screen. A root that
    // already matches only moves the cwd and rebuilds.
    if (state.root !== root) {
      reRootTree({
        ...port,
        setCwd: (tab, dir) => port.managers.tab.setCwd(tab, dir),
        hasTab: (tab) => port.managers.tab.tabs.some((open) => open.label === tab),
      }, label, state, root);
      return;
    }
    if (port.managers.tab.tabs.some((tab) => tab.label === label)) port.managers.tab.setCwd(label, root);
    port.rebuild(label);
  }, () => {});
}

function releaseRemote(port: OpenPort, label: string): void {
  const state = port.states.get(label);
  if (!state?.remote) return;
  forgetRemoteFilesOf(state.filesystem);
  state.filesystem.dispose();
  port.managers.remote.release(label);
}

function retarget(
  port: OpenPort, label: string, root: string, filesystem: FileSystemPort,
  remote?: RemoteTarget, ownerLabel?: string,
): void {
  const state = port.states.get(label);
  if (!state) return;
  dropExpandedWatchers(port, state);
  port.unwatchDir(state, '');
  if (!state.remote) state.filesystem.dispose();
  state.root = root;
  state.filesystem = filesystem;
  state.remote = remote;
  state.ownerLabel = ownerLabel;
  state.undoStack = [];
  state.redoStack = [];
  clearFilesystemCache(state);
  port.watchDir(label, root, '');
  port.refreshGit(label);
  if (port.managers.tab.tabs.some((tab) => tab.label === label)) port.managers.tab.setCwd(label, root);
  port.rebuild(label);
}
