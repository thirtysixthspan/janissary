import type { FileNavigatorSelectionRecord } from '@shared/protocol';

// Where every mounted file navigator publishes its current cursor/anchor/selection, keyed by tab
// index. The server owns the tree, but these three are client-only React state, so a `profile save`
// has to ask for them (see the `collect-tree-state` event). This module is the answer sheet: the
// hook writes into it on every selection change, and `ws.ts` reads it when the request arrives.

type PublishedSelection = { cursor: string | null; anchor: string | null; selected: Set<string> };

const selections = new Map<number, PublishedSelection>();

export function publishNavigatorSelection(index: number, selection: PublishedSelection): void {
  selections.set(index, selection);
}

export function clearNavigatorSelection(index: number): void {
  selections.delete(index);
}

// Every registered navigator's selection, in the reply shape the RPC carries. `null` cursors and
// anchors are dropped rather than sent, matching the optional keys a profile entry writes.
export function collectNavigatorSelections(): FileNavigatorSelectionRecord[] {
  const records: FileNavigatorSelectionRecord[] = [];
  for (const [index, selection] of selections) {
    records.push({
      index,
      cursor: selection.cursor ?? undefined,
      anchor: selection.anchor ?? undefined,
      selected: [...selection.selected],
    });
  }
  return records;
}
