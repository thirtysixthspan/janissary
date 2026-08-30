import { selectionActionFor } from '../file-navigator/selection-action.js';
import type { Managers } from '../managers.js';
import type { FileSelectionAction } from '../protocol.js';

function matchSelectionAction(managers: Managers, index: number, paths: string[]) {
  const label = managers.tab.tabs[index]?.label;
  const root = label === undefined ? undefined : managers.fileNavigator.rootOf(label);
  if (label === undefined || root === undefined) return null;
  const match = selectionActionFor(managers.plugins.declarations, root, paths);
  return match && { label, match };
}

export function fileNavigatorSelectionAction(
  managers: Managers, index: number, paths: string[],
): FileSelectionAction | null {
  const resolved = matchSelectionAction(managers, index, paths);
  return resolved ? { label: resolved.match.label, action: resolved.match.action } : null;
}

export function runFileNavigatorSelectionAction(
  managers: Managers, index: number, paths: string[], action: string,
): void {
  const resolved = matchSelectionAction(managers, index, paths);
  if (!resolved) return;
  void managers.plugins.runSelectionAction(
    resolved.match.plugin, action, resolved.match.paths,
    { label: resolved.label, command: resolved.match.label },
  );
}
