import { parentPath } from './index.js';

export type CommandSelection = {
  cursor?: string | null;
  anchor?: string | null;
  selected: Set<string>;
  cursorNamed: boolean;
  anchorNamed: boolean;
  selectionNamed: boolean;
  anchorToCursor: boolean;
};

function nearestVisibleAncestor(path: string, visible: ReadonlySet<string>): string | undefined {
  let candidate = path;
  while (candidate.includes('/')) {
    candidate = parentPath(candidate);
    if (visible.has(candidate)) return candidate;
  }
  return undefined;
}

export function selectionAfterCollapse(
  selection: CommandSelection,
  visible: ReadonlySet<string>,
): CommandSelection {
  const selected = new Set<string>();
  for (const path of selection.selected) {
    if (visible.has(path)) selected.add(path);
  }

  let cursor = selection.cursor;
  if (selection.cursorNamed && cursor && !visible.has(cursor)) {
    cursor = nearestVisibleAncestor(cursor, visible) ?? null;
  }

  let anchor = selection.anchor;
  let anchorToCursor = selection.anchorToCursor;
  if (selection.anchorNamed && anchor && !visible.has(anchor)) {
    if (selection.cursorNamed) anchor = cursor ?? null;
    else {
      anchor = undefined;
      anchorToCursor = true;
    }
  }

  return { ...selection, cursor, anchor, selected, anchorToCursor };
}
