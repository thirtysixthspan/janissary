import type { PatchContent, PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';
import { survives, type MoveRegistry, type MoveHop } from './move-chains.js';

export interface PatchDelete {
  place: PatchPlace;
  linkText: string | undefined;
  content: PatchContent;
}

export interface PatchWrite {
  content: PatchContent;
  text: string;
  bom: boolean;
  place: PatchPlace;
  finalPlace?: PatchPlace;
}

export interface PatchChanges {
  folders: readonly string[];
  deletes: PatchDelete[];
  writes: PatchWrite[];
  moves: (MoveHop & { link: boolean })[];
}

export interface PatchRecord {
  deletes: Map<PatchPlace, PatchDelete>;
  writes: Map<PatchContent, { place: PatchPlace; fromAdd: boolean }>;
  moves: MoveRegistry;
  removedByDelete: Set<PatchPlace>;
}

export function buildPatchChanges(view: PatchView, record: PatchRecord): PatchChanges {
  const places = view.places();
  const locationMap = new Map(places.map((place) => [place.location, place]));
  const active = record.moves.chains.filter((chain) => chain.onDisk && survives(chain) && chain.current !== chain.origin);
  const moves = active.flatMap((chain) => chain.hops.map((hop) => ({ ...hop, link: chain.link }))).toSorted((a, b) => a.order - b.order);
  const origins = new Set(active.map((chain) => chain.origin));
  const deletes = places.flatMap((place) => {
    const entry = record.deletes.get(place);
    return place.existed && entry && !origins.has(place) && (!place.exists || record.removedByDelete.has(place)) ? [entry] : [];
  });
  const writes: PatchWrite[] = [];
  const byContent = new Map<PatchContent, (typeof record.moves.chains)[number]>();
  for (const chain of record.moves.chains) {
    if (!chain.link && chain.current !== chain.origin && survives(chain) && !byContent.has(chain.content)) byContent.set(chain.content, chain);
  }
  for (const [content, entry] of record.writes) {
    const chain = byContent.get(content);
    const location = locationMap.get(content.realPath);
    if (!chain && location && (!location.exists || location.content !== content)) continue;
    if (content.current === undefined) continue;
    const place = chain?.current ?? entry.place;
    writes.push({ content, text: content.current, bom: content.hadBom && !entry.fromAdd, place, ...(chain && { finalPlace: place }) });
  }
  const folders = [...new Set([...view.plannedFolders(), ...moves.flatMap((move) => move.to.missingFolders)])];
  folders.sort((a, b) => a.split('/').length - b.split('/').length);
  return { folders, deletes, writes, moves };
}
