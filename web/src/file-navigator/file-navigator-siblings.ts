import type { FileNavigatorRow } from '@shared/protocol';
import type { FileNavigatorSelection } from './useFileNavigatorSelection';

// Cmd/Ctrl+A's selection: every visible row sharing the cursor row's parent directory. Rows are a
// depth-first, pre-flattened list, so a sibling is any row at the cursor's own depth reachable
// without crossing a shallower row — the same depth walk `parentOf` uses in `file-navigator-keys.ts`
// rather than string-splitting paths. Deriving it that way is what keeps an expanded subtree
// beneath a sibling out of the result: those rows are deeper.
//
// Lives in its own module because `useFileNavigatorSelection.ts` has no room left under the
// file-size limit. The cursor and anchor are left where they are, and a null cursor or a cursor on
// the ".." row selects nothing and clears nothing.
export function siblingSelection(
  state: FileNavigatorSelection, rows: FileNavigatorRow[],
): FileNavigatorSelection {
  if (state.cursor === null || state.cursor === '..') return state;
  const index = rows.findIndex((row) => row.path === state.cursor);
  if (index === -1) return state;

  const { depth } = rows[index];
  const selected = new Set<string>();
  const collect = (step: number) => {
    for (let i = index; i >= 0 && i < rows.length && rows[i].depth >= depth; i += step) {
      if (rows[i].depth === depth && rows[i].path !== '..') selected.add(rows[i].path);
    }
  };
  collect(-1);
  collect(1);
  return { cursor: state.cursor, anchor: state.anchor, selected };
}
