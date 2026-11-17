import { encodeToolText } from '../file-write/filesystem.js';
import type { PatchRecord } from './changes.js';
import { retargetLink } from './move-chains.js';
import type { PatchContent, PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

export type SectionFailure = { reason: string; hunkLine?: never } | { hunkLine: string; reason?: never };

export function followLink(view: PatchView, place: PatchPlace, record: PatchRecord): string | undefined {
  const seen = new Set<PatchPlace>();
  let current = place;
  while (current.linkText !== undefined && current.exists) {
    if (seen.has(current)) return 'Not a text file';
    seen.add(current);
    const result = view.resolveLink(current);
    if (!result.ok) return result.reason;
    if (!result.value.exists) return 'Not a text file';
    current = result.value;
  }
  if (current !== place) {
    retargetLink(record.moves, place, current.content);
    place.content = current.content;
  }
  return undefined;
}

export function freshContent(place: PatchPlace): PatchContent {
  return { realPath: place.location, original: undefined, mode: undefined, hadBom: false, current: undefined };
}

export function checkText(text: string, bom: boolean): SectionFailure | undefined {
  const encoded = encodeToolText((bom ? '\u{FEFF}' : '') + text);
  return encoded.ok ? undefined : { reason: encoded.reason };
}

export function recordWrite(record: PatchRecord, place: PatchPlace, fromAdd: boolean): void {
  const previous = record.writes.get(place.content);
  record.writes.set(place.content, { place: previous?.place ?? place, fromAdd: fromAdd || (previous?.fromAdd ?? false) });
}
