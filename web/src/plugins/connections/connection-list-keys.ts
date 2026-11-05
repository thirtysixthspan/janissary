import type { ConnectionRow } from '@shared/plugins/connections/shared';
import { nextListSelection, relativeActivity } from '../api';

export type ConnectionClickConfirmation = { identity: string; order: string };

// The Last activity cell. Zero is the host's "no activity known", which reads as an empty cell
// rather than as an age measured from 1970.
export function connectionActivity(timestamp: number, now: number): { text: string; dateTime?: string } {
  if (timestamp === 0) return { text: '' };
  return { text: relativeActivity(timestamp, now), dateTime: new Date(timestamp).toISOString() };
}

export function connectionRowIdentity(row: ConnectionRow): string {
  return JSON.stringify([row.type, row.kind, row.id, row.ownerLabel]);
}

export function connectionListOrder(rows: ConnectionRow[]): string {
  return JSON.stringify(rows.map((row) => connectionRowIdentity(row)));
}

export function nextConnectionSelection(length: number, selected: number | null, key: string): number | null {
  return nextListSelection(length, selected, key);
}

export function connectionKeyboardNavigation(
  length: number,
  selected: number | null,
  key: string,
): { selected: number | null; confirmation: null } | null {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return null;
  return { selected: nextConnectionSelection(length, selected, key), confirmation: null };
}

export function connectionClickSelection(
  index: number,
  rows: ConnectionRow[],
  confirmed: ConnectionClickConfirmation | null,
): { confirmation: ConnectionClickConfirmation; opens: boolean } {
  const identity = connectionRowIdentity(rows[index]);
  const order = connectionListOrder(rows);
  return {
    confirmation: { identity, order },
    opens: confirmed?.identity === identity && confirmed.order === order,
  };
}
