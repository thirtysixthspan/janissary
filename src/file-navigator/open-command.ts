import { statSync } from 'node:fs';
import path from 'node:path';
import { parseFileNavigatorArgs } from './args.js';
import { expandUserPath } from '../paths.js';
import { resolveTarget } from '../commands/resolve-target.js';
import type { Managers } from '../managers.js';
import type { FileNavigatorDetail, RemoteTarget } from '../tab/types.js';
import type { FilesTabState } from './state.js';
import { LocalFileSystemPort, type FileSystemPort } from './filesystem-port.js';
import { buildCachedRows } from './filesystem-cache.js';
import { RemoteFileSystemPort } from './remote-port.js';
import { clearFilesystemCache } from './filesystem-cache.js';

type CwdTarget = { cwd: string; sourceLabel?: string; remote?: RemoteTarget };

// The directory a `files` command roots its tree at: the issuing tab's cwd, or — with an `in
// <label>` clause — the named tab's. Undefined when the named tab doesn't exist, which
// `resolveTarget` has already reported.
function resolveCwd(
  managers: Managers, label: string, inLabel: string | undefined, out: (text: string) => void,
): CwdTarget | undefined {
  if (inLabel === undefined) return { cwd: managers.tab.cwdOf(label) ?? process.cwd() };
  const sourceTab = resolveTarget(inLabel, managers, out);
  if (!sourceTab) return undefined;
  return {
    cwd: managers.remote?.workspaceOf(sourceTab.label) ?? managers.tab.cwdOf(sourceTab.label) ?? process.cwd(),
    sourceLabel: sourceTab.label,
    remote: sourceTab.remote,
  };
}

// A fresh per-tab state record for a tree rooted at `root`, starting in `details` mode.
function freshState(
  root: string, details: FileNavigatorDetail,
  filesystem: FileSystemPort = new LocalFileSystemPort(), remote?: RemoteTarget, ownerLabel?: string,
): FilesTabState {
  return {
    root,
    filesystem,
    remote,
    ownerLabel,
    expanded: new Set<string>(),
    watchers: new Map(),
    listings: new Map(),
    listingLoads: new Set(),
    statLoads: new Set(),
    undoStack: [],
    redoStack: [],
    gitStatuses: new Map(),
    details,
    stats: new Map(),
  };
}

function openRemoteTree(
  managers: Managers, tabs: Map<string, FilesTabState>, sourceLabel: string, remote: RemoteTarget,
  root: string, details: FileNavigatorDetail, dock: 'left' | 'right' | null,
  watchDir: (label: string, absDir: string, relPath: string) => void,
  refreshGit: (label: string) => void,
  rebuild: (label: string) => void,
  rootAfterReady: (workspace: string) => string,
): string | undefined {
  const channel = managers.remote.get(sourceLabel);
  const ready = managers.remote.readyOf(sourceLabel);
  if (!channel || !ready) return undefined;
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows: [], waitingFor: root, details, remote });
  const label = managers.tab.cur().label;
  if (!managers.remote.attach(label, sourceLabel)) return undefined;
  const state = freshState(root, details, new RemoteFileSystemPort(channel, label, ready), remote, sourceLabel);
  state.remoteRoot = managers.remote.workspaceOf(sourceLabel);
  managers.tab.setCwd(label, root);
  tabs.set(label, state);
  watchDir(label, root, '');
  refreshGit(label);
  void ready.then((workspace) => {
    const current = tabs.get(label);
    if (current !== state) return;
    current.remoteRoot = workspace;
    const nextRoot = rootAfterReady(workspace);
    if (current.root !== nextRoot) {
      for (const watcher of current.watchers.values()) watcher.stop();
      current.watchers.clear();
      current.root = nextRoot;
      clearFilesystemCache(current);
      current.listingLoads.clear();
      current.statLoads.clear();
      managers.tab.setCwd(label, nextRoot);
      watchDir(label, nextRoot, '');
    }
    if (managers.tab.findIndex(label) !== -1) rebuild(label);
  }, () => {});
  if (dock) managers.tab.setDock(managers.tab.findIndex(label), dock);
  return label;
}

// A tree already open on this root is focused or redocked rather than duplicated, so a `with
// <mode>` clause has to land on it here — re-running the command is the second way to switch an
// open tree's detail mode, alongside the header button.
function focusExisting(
  managers: Managers, tabs: Map<string, FilesTabState>, existingLabel: string,
  dock: 'left' | 'right' | null, details: FileNavigatorDetail | undefined,
  rebuild: (label: string) => void,
): string {
  managers.tab.setDock(managers.tab.findIndex(existingLabel), dock);
  const state = tabs.get(existingLabel);
  if (state && details) {
    state.details = details;
    rebuild(existingLabel);
  }
  return existingLabel;
}

// Open a tab that waits for `root` to be created, polling until it appears.
function openWaitingTree(
  managers: Managers, tabs: Map<string, FilesTabState>, root: string, state: FilesTabState,
  dock: 'left' | 'right' | null, pollForCreation: (label: string, absDir: string) => void,
): string {
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows: [], waitingFor: root });
  const waitingLabel = managers.tab.cur().label;
  managers.tab.setCwd(waitingLabel, root);
  tabs.set(waitingLabel, state);
  pollForCreation(waitingLabel, root);
  if (dock) managers.tab.setDock(managers.tab.findIndex(waitingLabel), dock);
  return waitingLabel;
}

// Open a tree on an existing directory. The rows are decorated before the tab is opened so the
// first payload already carries stat values — otherwise a `files with size` open would paint one
// frame of bare names before the first rebuild.
function openTree(
  managers: Managers, tabs: Map<string, FilesTabState>, root: string, state: FilesTabState,
  dock: 'left' | 'right' | null,
  watchDir: (label: string, absDir: string, relPath: string) => void,
  refreshGit: (label: string) => void,
): string {
  const rows = buildCachedRows(state, () => {});
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows, details: state.details });
  const newLabel = managers.tab.cur().label;
  managers.tab.setCwd(newLabel, root);
  tabs.set(newLabel, state);
  watchDir(newLabel, root, '');
  if (dock) managers.tab.setDock(managers.tab.findIndex(newLabel), dock);
  refreshGit(newLabel);
  return newLabel;
}

// FileNavigatorManager.open, extracted whole: resolves a `files [left|right] [path]` command into a
// root directory, then either redocks an already-open tab on that root or opens a fresh one.
// Returns the label of the tab it opened, redocked, or focused — what `profile launch` needs to
// restore that tree's saved view onto — or undefined when nothing was opened.
export function openFilesCommand(
  managers: Managers, tabs: Map<string, FilesTabState>, command: string, label: string,
  watchDir: (label: string, absDir: string, relPath: string) => void,
  refreshGit: (label: string) => void,
  pollForCreation: (label: string, absDir: string) => void,
  rebuild: (label: string) => void,
): string | undefined {
  const rest = command.replace(/^files\b\s*/i, '');
  const { inLabel, dock, details, target } = parseFileNavigatorArgs(rest);
  const out = (text: string) => managers.tab.append(label, { input: command, output: text });

  const resolved = resolveCwd(managers, label, inLabel, out);
  if (resolved === undefined) return undefined;
  const { cwd } = resolved;

  const expandedPath = target ? expandUserPath(target, { root: managers.tab.launchDir }) : '';
  const root = target ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(cwd, expandedPath)) : cwd;

  if (resolved.remote && resolved.sourceLabel) {
    const existing = managers.tab.tabs.find(
      (tab) => tab.files?.root === root && tab.files.remote?.address === resolved.remote?.address,
    );
    if (existing) return focusExisting(managers, tabs, existing.label, dock, details, rebuild);
    return openRemoteTree(
      managers, tabs, resolved.sourceLabel, resolved.remote, root, details ?? 'name', dock, watchDir,
      refreshGit, rebuild,
      (workspace) => target
        ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(workspace, expandedPath))
        : workspace,
    );
  }

  let stat;
  let exists = true;
  try { stat = statSync(root); } catch { stat = undefined; exists = false; }
  if (exists && !stat?.isDirectory()) { out(`files: ${root}: not a directory`); return undefined; }

  const existing = managers.tab.tabs.find((t) => t.files?.root === root);
  if (existing) return focusExisting(managers, tabs, existing.label, dock, details, rebuild);

  const state = freshState(root, details ?? 'name');
  if (!exists) return openWaitingTree(managers, tabs, root, state, dock, pollForCreation);
  return openTree(managers, tabs, root, state, dock, watchDir, refreshGit);
}
