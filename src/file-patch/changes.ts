import type { PatchContent, PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

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
}

export interface PatchChanges {
  folders: readonly string[];
  deletes: PatchDelete[];
  writes: PatchWrite[];
}

export interface PatchRecord {
  deletes: Map<PatchPlace, PatchDelete>;
  writes: Map<PatchContent, { place: PatchPlace; fromAdd: boolean }>;
}

export function buildPatchChanges(view: PatchView, record: PatchRecord): PatchChanges {
  const places = view.places();
  const removedLocations = new Set(places.filter((place) => !place.exists).map((place) => place.location));
  const deletes = places.flatMap((place) => {
    const entry = record.deletes.get(place);
    return place.existed && entry ? [entry] : [];
  });
  const writes: PatchWrite[] = [];
  for (const [content, entry] of record.writes) {
    if (removedLocations.has(content.realPath)) continue;
    if (content.current === undefined) continue;
    writes.push({ content, text: content.current, bom: content.hadBom && !entry.fromAdd, place: entry.place });
  }
  return { folders: view.plannedFolders(), deletes, writes };
}
