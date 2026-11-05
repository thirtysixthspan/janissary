import type { DragEvent } from 'react';
import type { RoleEntry } from '@shared/plugins/roles/shared';

// The tab's drag-and-drop uses the browser's HTML5 gesture to reorder entries and roles. Nothing
// here tracks a pointer or measures rects because an in-tab drop needs no live transform.

export type RolesDrag =
  | { kind: 'entry'; role: string; index: number; expected: RoleEntry[] }
  | { kind: 'role'; name: string };

// One drag at a time belongs to one page, and the payload rides here rather than through
// `dataTransfer`, whose data is unreadable during `dragover` — the gesture that highlights a zone.
let current: RolesDrag | null = null;

const begin = (event: DragEvent, drag: RolesDrag): void => {
  current = drag;
  event.dataTransfer.effectAllowed = 'move';
};

export function dragEntry(event: DragEvent, role: string, index: number, entries: readonly RoleEntry[]): void {
  begin(event, { kind: 'entry', role, index, expected: entries.map((entry) => ({ ...entry })) });
}

export function dragRole(event: DragEvent, name: string): void {
  begin(event, { kind: 'role', name });
}

export function dragEnd(): void {
  current = null;
}

export function dragging(): RolesDrag | null {
  return current;
}

export function allowDrop(event: DragEvent, accepted: (drag: RolesDrag) => boolean): void {
  const drag = current;
  if (!drag || !accepted(drag)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

export function dropOnRole(
  event: DragEvent, role: string, index: number,
): { intent: string; payload: Record<string, unknown> } | null {
  event.preventDefault();
  const drag = current;
  current = null;
  if (drag?.kind === 'role' && drag.name !== role) {
    return { intent: 'move-role', payload: { name: drag.name, to: index } };
  }
  return null;
}

// Only a sibling-entry reorder consumes the event, so a role grip dropped here reaches the card.
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
