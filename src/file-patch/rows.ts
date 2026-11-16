import type { PatchPlace } from './view-entry.js';
import { showsRename, type MoveChain } from './move-chains.js';

export type PatchRow = {
  letter: 'A' | 'M' | 'D';
  path: string;
} | { letter: 'R'; path: string; target: string };

export function patchRows(places: readonly PatchPlace[], chains: readonly MoveChain[]): PatchRow[] {
  const renames = chains.filter(showsRename);
  return places.flatMap((place): PatchRow[] => {
    const rename = renames.find((chain) => chain.origin === place);
    if (rename) return [{ letter: 'R', path: place.requested, target: rename.current.requested }];
    if (renames.some((chain) => chain.current === place)) return [];
    if (!place.existed && !place.exists) return [];
    const letter = place.existed ? (place.exists ? 'M' : 'D') : 'A';
    return [{ letter, path: place.requested }];
  });
}
