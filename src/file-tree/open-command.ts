import { statSync } from 'node:fs';
import path from 'node:path';
import { buildRows } from './index.js';
import { parseFileTreeArgs } from './args.js';
import { expandUserPath } from '../paths.js';
import { resolveTarget } from '../commands/resolve-target.js';
import type { Managers } from '../managers.js';
import type { FilesTabState } from './manager.js';

// FileTreeManager.open, extracted whole: resolves a `files [left|right] [path]` command into a
// root directory, then either redocks an already-open tab on that root or opens a fresh one.
export function openFilesCommand(
  managers: Managers, tabs: Map<string, FilesTabState>, command: string, label: string,
  watchDir: (label: string, absDir: string, relPath: string) => void,
  refreshGit: (label: string) => void,
): void {
  const rest = command.replace(/^files\b\s*/i, '');
  const { inLabel, dock, target } = parseFileTreeArgs(rest);
  const out = (text: string) => managers.tab.append(label, { input: command, output: text });

  let cwd: string;
  if (inLabel === undefined) {
    cwd = managers.tab.cwdOf(label) ?? process.cwd();
  } else {
    const sourceTab = resolveTarget(inLabel, managers, out);
    if (!sourceTab) return;
    cwd = managers.tab.cwdOf(sourceTab.label) ?? process.cwd();
  }

  const expandedPath = target ? expandUserPath(target, { root: managers.tab.launchDir }) : '';
  const root = target ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(cwd, expandedPath)) : cwd;

  let stat;
  try { stat = statSync(root); } catch { stat = undefined; }
  if (!stat?.isDirectory()) { out(`files: ${root}: not a directory`); return; }

  const existing = managers.tab.tabs.find((t) => t.files?.root === root);
  if (existing) { managers.tab.setDock(managers.tab.findIndex(existing.label), dock); return; }

  const expanded = new Set<string>();
  managers.tab.openFilesTab({ root, absoluteRoot: root, rows: buildRows(root, expanded) });
  const newLabel = managers.tab.cur().label;
  managers.tab.setCwd(newLabel, root);
  tabs.set(newLabel, { root, expanded, watchers: new Map(), undoStack: [], redoStack: [], gitStatuses: new Map() });
  watchDir(newLabel, root, '');
  if (dock) managers.tab.setDock(managers.tab.findIndex(newLabel), dock);
  refreshGit(newLabel);
}
