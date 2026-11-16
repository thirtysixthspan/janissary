import type { PatchPlace } from './view-entry.js';
import { showsRename, type MoveChain } from './move-chains.js';

export type PatchRow = {
  letter: 'A' | 'M' | 'D';
  path: string;
} | { letter: 'R'; path: string; target: string };

export function patchRows(places: readonly PatchPlace[], chains: readonly MoveChain[]): PatchRow[] {
  const renames = chains.filter(showsRename);
  const origins = new Map<PatchPlace, MoveChain>();
  const destinations = new Set<PatchPlace>();
  for (const chain of renames) {
    if (!origins.has(chain.origin)) origins.set(chain.origin, chain);
    destinations.add(chain.current);
  }
  return places.flatMap((place): PatchRow[] => {
    const rename = origins.get(place);
    if (rename) return [{ letter: 'R', path: place.requested, target: rename.current.requested }];
    if (destinations.has(place)) return [];
    if (!place.existed && !place.exists) return [];
    const letter = place.existed ? (place.exists ? 'M' : 'D') : 'A';
    return [{ letter, path: place.requested }];
  });
}
