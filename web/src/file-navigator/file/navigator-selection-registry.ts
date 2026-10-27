import type { FileNavigatorSelectionRecord } from '@shared/protocol';

// Where every mounted file navigator publishes its current cursor/anchor/selection, keyed by tab
// label so tab-strip changes cannot associate one tree's state with another. The server owns the tree,
// but these three are client-only React state, so `profile save` and `files print` ask for them
// (see the `collect-tree-state` event). This module is the answer sheet: the
// hook writes into it on every selection change, and `ws.ts` reads it when the request arrives.

type PublishedSelection = { cursor: string | null; anchor: string | null; selected: Set<string> };

const selections = new Map<string, PublishedSelection>();

export function publishNavigatorSelection(label: string, selection: PublishedSelection): void {
  selections.set(label, selection);
}

export function clearNavigatorSelection(label: string): void {
  selections.delete(label);
}

// Every registered navigator's selection, in the reply shape the RPC carries. `null` cursors and
// anchors are dropped rather than sent, matching the optional keys a profile entry writes.
export function collectNavigatorSelections(): FileNavigatorSelectionRecord[] {
  const records: FileNavigatorSelectionRecord[] = [];
  for (const [label, selection] of selections) {
    records.push({
      label,
      cursor: selection.cursor ?? undefined,
      anchor: selection.anchor ?? undefined,
      selected: [...selection.selected],
    });
  }
  return records;
}
