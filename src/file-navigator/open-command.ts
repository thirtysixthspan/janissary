import { statSync } from 'node:fs';
import path from 'node:path';
import { buildRows } from './index.js';
import { parseFileNavigatorArgs } from './args.js';
import { expandUserPath } from '../paths.js';
import { resolveTarget } from '../commands/resolve-target.js';
import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';
import { syncStatusForRoot } from './sync.js';

// FileNavigatorManager.open, extracted whole: resolves a `files [left|right] [path]` command into a
// root directory, then either redocks an already-open tab on that root or opens a fresh one.
// Returns the label of the tab it opened, redocked, or focused — what `profile launch` needs to
// restore that tree's saved view onto — or undefined when nothing was opened.
export function openFilesCommand(
  managers: Managers, tabs: Map<string, FilesTabState>, command: string, label: string,
  watchDir: (label: string, absDir: string, relPath: string) => void,
  refreshGit: (label: string) => void,
  pollForCreation: (label: string, absDir: string) => void,
): string | undefined {
  const rest = command.replace(/^files\b\s*/i, '');
  const { inLabel, dock, target } = parseFileNavigatorArgs(rest);
  const out = (text: string) => managers.tab.append(label, { input: command, output: text });

  let cwd: string;
  if (inLabel === undefined) {
    cwd = managers.tab.cwdOf(label) ?? process.cwd();
  } else {
    const sourceTab = resolveTarget(inLabel, managers, out);
    if (!sourceTab) return undefined;
    cwd = managers.tab.cwdOf(sourceTab.label) ?? process.cwd();
  }

  const expandedPath = target ? expandUserPath(target, { root: managers.tab.launchDir }) : '';
  const root = target ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(cwd, expandedPath)) : cwd;

  let stat;
  let exists = true;
  try { stat = statSync(root); } catch { stat = undefined; exists = false; }
  if (exists && !stat?.isDirectory()) { out(`files: ${root}: not a directory`); return undefined; }

  const existing = managers.tab.tabs.find((t) => t.files?.root === root);
  if (existing) { managers.tab.setDock(managers.tab.findIndex(existing.label), dock); return existing.label; }

  const expanded = new Set<string>();
  const sync = syncStatusForRoot(managers, root);

  if (!exists) {
    managers.tab.openFilesTab({ root, absoluteRoot: root, rows: [], waitingFor: root, sync });
    const waitingLabel = managers.tab.cur().label;
    managers.tab.setCwd(waitingLabel, root);
    tabs.set(waitingLabel, { root, expanded, watchers: new Map(), undoStack: [], redoStack: [], gitStatuses: new Map(), sync });
    pollForCreation(waitingLabel, root);
    if (dock) managers.tab.setDock(managers.tab.findIndex(waitingLabel), dock);
    return waitingLabel;
  }

  managers.tab.openFilesTab({ root, absoluteRoot: root, rows: buildRows(root, expanded), sync });
  const newLabel = managers.tab.cur().label;
  managers.tab.setCwd(newLabel, root);
  tabs.set(newLabel, { root, expanded, watchers: new Map(), undoStack: [], redoStack: [], gitStatuses: new Map(), sync });
  watchDir(newLabel, root, '');
  if (dock) managers.tab.setDock(managers.tab.findIndex(newLabel), dock);
  refreshGit(newLabel);
  return newLabel;
}
