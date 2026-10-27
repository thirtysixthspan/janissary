import { buildRows } from './index.js';
import { listingFor } from './filesystem-cache.js';
import { collapseTree, expandAndWatch, type NavPort } from './navigation.js';
import { nextRestoreRevision, stillDirectory } from './restore.js';
import { selectionAfterCollapse, type CommandSelection } from './selection-fallback.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorRestoreHint } from '../tab/types.js';
import type { ViewStep } from './view-args.js';

function visiblePaths(state: FilesTabState, onReady: () => void): Set<string> {
  return new Set(buildRows(
    state.root,
    state.expanded,
    (_absolute, relPath) => listingFor(state, relPath, onReady) ?? [],
  ).map((row) => row.path));
}

function applyStep(
  port: NavPort,
  label: string,
  state: FilesTabState,
  step: ViewStep,
  selection: CommandSelection,
  onReady: () => void,
): CommandSelection {
  if (step.kind === 'expand') {
    if (step.path !== '' && stillDirectory(state, step.path, onReady)) {
      expandAndWatch(port, label, state, step.path);
    }
    return selection;
  }

  if (step.kind === 'collapse') {
    const isOpen = step.path === '' ? state.expanded.size > 0 : state.expanded.has(step.path);
    const exists = step.path === '' || stillDirectory(state, step.path, onReady);
    if (isOpen && exists) {
      collapseTree(port, state, step.path);
      return selectionAfterCollapse(selection, visiblePaths(state, onReady));
    }
    return selection;
  }

  if (!visiblePaths(state, onReady).has(step.path)) return selection;
  if (step.kind === 'cursor') return { ...selection, cursor: step.path, cursorNamed: true };
  if (step.kind === 'anchor') {
    return { ...selection, anchor: step.path, anchorNamed: true, anchorToCursor: false };
  }
  const selected = new Set(selection.selected);
  selected.add(step.path);
  return { ...selection, selected, selectionNamed: true };
}

function restoreHint(selection: CommandSelection): FileNavigatorRestoreHint {
  const hint: FileNavigatorRestoreHint = { revision: nextRestoreRevision() };
  if (selection.cursorNamed) hint.cursor = selection.cursor ?? null;
  if (selection.anchorToCursor) hint.anchorToCursor = true;
  else if (selection.anchorNamed) hint.anchor = selection.anchor ?? null;
  if (selection.selectionNamed) hint.selected = [...selection.selected];
  return hint;
}

export function applyViewSteps(port: NavPort, label: string, steps: ViewStep[]): void {
  const state = port.states.get(label);
  if (!state) return;
  const onReady = () => port.rebuild(label);
  let selection: CommandSelection = {
    selected: new Set(),
    cursorNamed: false,
    anchorNamed: false,
    selectionNamed: false,
    anchorToCursor: false,
  };
  for (const step of steps) selection = applyStep(port, label, state, step, selection, onReady);
  state.restore = restoreHint(selection);
  port.rebuild(label);
}
