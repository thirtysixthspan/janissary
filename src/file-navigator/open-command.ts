import { statSync } from 'node:fs';
import path from 'node:path';
import { buildRows } from './index.js';
import { markStats } from './stats.js';
import { parseFileNavigatorArgs } from './args.js';
import { expandUserPath } from '../paths.js';
import { resolveTarget } from '../commands/resolve-target.js';
import type { Managers } from '../managers.js';
import type { FileNavigatorDetail } from '../types.js';
import type { FilesTabState } from './state.js';
import { syncStatusForRoot } from './sync.js';

// The directory a `files` command roots its tree at: the issuing tab's cwd, or — with an `in
// <label>` clause — the named tab's. Undefined when the named tab doesn't exist, which
// `resolveTarget` has already reported.
function resolveCwd(
  managers: Managers, label: string, inLabel: string | undefined, out: (text: string) => void,
): string | undefined {
  if (inLabel === undefined) return managers.tab.cwdOf(label) ?? process.cwd();
  const sourceTab = resolveTarget(inLabel, managers, out);
  if (!sourceTab) return undefined;
  return managers.tab.cwdOf(sourceTab.label) ?? process.cwd();
}

// A fresh per-tab state record for a tree rooted at `root`, starting in `details` mode and
// carrying the Git-sync status resolved for that root.
function freshState(
  root: string, details: FileNavigatorDetail, sync: FilesTabState['sync'],
): FilesTabState {
  return {
    root,
    expanded: new Set<string>(),
    watchers: new Map(),
    undoStack: [],
    redoStack: [],
    gitStatuses: new Map(),
    sync,
    details,
    stats: new Map(),
  };
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
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows: [], waitingFor: root, sync: state.sync });
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
  const rows = markStats(state, buildRows(root, state.expanded));
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows, sync: state.sync, details: state.details });
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

  const cwd = resolveCwd(managers, label, inLabel, out);
  if (cwd === undefined) return undefined;

  const expandedPath = target ? expandUserPath(target, { root: managers.tab.launchDir }) : '';
  const root = target ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(cwd, expandedPath)) : cwd;

  let stat;
  let exists = true;
  try { stat = statSync(root); } catch { stat = undefined; exists = false; }
  if (exists && !stat?.isDirectory()) { out(`files: ${root}: not a directory`); return undefined; }

  const existing = managers.tab.tabs.find((t) => t.files?.root === root);
  if (existing) return focusExisting(managers, tabs, existing.label, dock, details, rebuild);

  const state = freshState(root, details ?? 'name', syncStatusForRoot(managers, root));
  if (!exists) return openWaitingTree(managers, tabs, root, state, dock, pollForCreation);
  return openTree(managers, tabs, root, state, dock, watchDir, refreshGit);
}
