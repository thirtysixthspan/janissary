import { encodeToolText } from '../file-write/filesystem.js';
import type { PatchRecord } from './changes.js';
import type { PatchContent, PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

export type SectionFailure = { reason: string; hunkLine?: never } | { hunkLine: string; reason?: never };

export function followLink(view: PatchView, place: PatchPlace, record: PatchRecord): boolean {
  if (place.linkText === undefined) return false;
  const location = record.linkTargets.get(place) ?? place.content.realPath;
  record.linkTargets.set(place, location);
  const target = view.places().find((other) => other.location === location);
  if (place.exists && target && !target.exists) return true;
  if (target?.exists) place.content = target.content;
  return false;
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
