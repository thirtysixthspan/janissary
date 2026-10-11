import type { DragEvent } from 'react';
import type { RoleEntry } from '@shared/plugins/roles/shared';

// The tab's drag-and-drop, on the browser's own HTML5 gesture: a catalog model dragged onto a role
// card appends an entry, an entry dragged onto the catalog column removes it, and an entry or a role
// dragged onto a sibling moves to that position. Nothing here tracks a pointer or measures rects —
// an in-tab drop needs no live transform and no cross-surface drop handles — so three handlers and
// one remembered drag replace the threshold-and-window-listeners machinery the app's cross-surface
// gestures (`web/src/useTabReorder.ts`, `useFileNavigatorDrag`) carry for dragging between windows.

export type RolesDrag =
  | { kind: 'catalog'; harness: string; model: string }
  | { kind: 'entry'; role: string; index: number; expected: RoleEntry[] }
  | { kind: 'role'; name: string };

// One drag at a time belongs to one page, and the payload rides here rather than through
// `dataTransfer`, whose data is unreadable during `dragover` — the gesture that has to highlight the
// zone it would land on.
let current: RolesDrag | null = null;

const begin = (event: DragEvent, drag: RolesDrag, effect: 'copy' | 'move'): void => {
  current = drag;
  event.dataTransfer.effectAllowed = effect;
};

export function dragCatalogModel(event: DragEvent, harness: string, model: string): void {
  begin(event, { kind: 'catalog', harness, model }, 'copy');
}

export function dragEntry(event: DragEvent, role: string, index: number, entries: readonly RoleEntry[]): void {
  begin(event, { kind: 'entry', role, index, expected: entries.map((entry) => ({ ...entry })) }, 'move');
}

export function dragRole(event: DragEvent, name: string): void {
  begin(event, { kind: 'role', name }, 'move');
}

export function dragEnd(): void {
  current = null;
}

// What is being dragged right now, or null between gestures. Exported for the drop handlers and the
// highlight they show.
export function dragging(): RolesDrag | null {
  return current;
}

// A zone the current drag means something on calls this in `dragover`; without it the browser
// refuses the drop outright.
export function allowDrop(event: DragEvent, accepted: (drag: RolesDrag) => boolean): void {
  const drag = current;
  if (!drag || !accepted(drag)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = drag.kind === 'catalog' ? 'copy' : 'move';
}

// The intent payload a completed drop on a role card raises, or null when the drag means nothing
// there. A catalog model appends an entry; a sibling role moves to this card's position.
export function dropOnRole(
  event: DragEvent, role: string, index: number,
): { intent: string; payload: Record<string, unknown> } | null {
  event.preventDefault();
  const drag = current;
  current = null;
  if (!drag) return null;
  if (drag.kind === 'catalog') {
    const entry: RoleEntry = { harness: drag.harness, model: drag.model };
    return { intent: 'add-entry', payload: { role, entry } };
  }
  if (drag.kind === 'role' && drag.name !== role) {
    return { intent: 'move-role', payload: { name: drag.name, to: index } };
  }
  return null;
}

// A drop on an entry row: a sibling entry moves onto this position. The row is nested inside its
// role card, and a drag it does not handle belongs to that card — a catalog model or a role grip
// dropped here still lands on the card — so it answers null without ending the gesture. Only the
// reorder it owns consumes the event, so the card behind it raises nothing a second time.
export function dropOnEntry(
  event: DragEvent, role: string, index: number,
): { intent: string; payload: Record<string, unknown> } | null {
  const drag = current;
  if (drag?.kind !== 'entry' || drag.role !== role || drag.index === index) return null;
  event.preventDefault();
  event.stopPropagation();
  current = null;
  return { intent: 'move-entry', payload: { role, from: drag.index, to: index, expected: drag.expected } };
}

// A drop on the catalog column takes an entry out of its role.
export function dropOnCatalog(event: DragEvent): { intent: string; payload: Record<string, unknown> } | null {
  event.preventDefault();
  const drag = current;
  current = null;
  if (drag?.kind === 'entry') {
    return { intent: 'remove-entry', payload: { role: drag.role, index: drag.index, expected: drag.expected } };
  }
  return null;
}
