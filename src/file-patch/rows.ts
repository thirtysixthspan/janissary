import type { PatchPlace } from './view-entry.js';

export interface PatchRow {
  letter: 'A' | 'M' | 'D';
  path: string;
}

export function patchRows(places: readonly PatchPlace[]): PatchRow[] {
  return places.flatMap((place): PatchRow[] => {
    if (!place.existed && !place.exists) return [];
    const letter = place.existed ? (place.exists ? 'M' : 'D') : 'A';
    return [{ letter, path: place.requested }];
  });
}
