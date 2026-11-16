import { encodeToolText } from '../file-write/filesystem.js';
import { buildPatchChanges, type PatchChanges, type PatchRecord } from './changes.js';
import { applyHunks } from './hunks.js';
import type { PatchSection } from './parse.js';
import { patchRows, type PatchRow } from './rows.js';
import type { PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

export type ApplySectionsResult =
  | { ok: true; changes: PatchChanges; rows: PatchRow[] }
  | { ok: false; section: number; marker: string; reason: string; hunkLine?: never }
  | { ok: false; section: number; marker: string; hunkLine: string; reason?: never };

type SectionFailure = { reason: string; hunkLine?: never } | { hunkLine: string; reason?: never };

function dangling(view: PatchView, place: PatchPlace): boolean {
  return place.linkText !== undefined && place.exists && view.places().some(
    (other) => other.location === place.content.realPath && !other.exists,
  );
}

function recordWrite(record: PatchRecord, place: PatchPlace, fromAdd: boolean): void {
  const previous = record.writes.get(place.content);
  record.writes.set(place.content, { place: previous?.place ?? place, fromAdd: fromAdd || (previous?.fromAdd ?? false) });
}

function add(place: PatchPlace, section: Extract<PatchSection, { kind: 'add' }>, record: PatchRecord): SectionFailure | undefined {
  if (place.exists) return { reason: 'File already exists' };
  const text = section.lines.length === 0 ? '' : `${section.lines.join('\n')}\n`;
  const encoded = encodeToolText(text);
  if (!encoded.ok) return { reason: encoded.reason };
  if (place.linkText !== undefined) {
    place.content = { realPath: place.location, original: undefined, mode: undefined, hadBom: false, current: undefined };
    place.linkText = undefined;
  }
  place.exists = true;
  place.content.current = text;
  recordWrite(record, place, true);
  return undefined;
}

function remove(place: PatchPlace, record: PatchRecord): SectionFailure | undefined {
  if (!place.exists) return { reason: 'File not found' };
  if (!record.deletes.has(place)) record.deletes.set(place, { place, linkText: place.linkText, content: place.content });
  place.exists = false;
  return undefined;
}

function update(place: PatchPlace, section: Extract<PatchSection, { kind: 'update' }>, record: PatchRecord): SectionFailure | undefined {
  if (!place.exists) return { reason: 'File not found' };
  const result = applyHunks(place.content.current ?? '', section.hunks);
  if (!result.ok) return { hunkLine: result.line };
  const fromAdd = record.writes.get(place.content)?.fromAdd ?? false;
  const encoded = encodeToolText((place.content.hadBom && !fromAdd ? '\u{FEFF}' : '') + result.text);
  if (!encoded.ok) return { reason: encoded.reason };
  place.content.current = result.text;
  recordWrite(record, place, false);
  return undefined;
}

function applyOne(view: PatchView, section: PatchSection, record: PatchRecord): SectionFailure | undefined {
  const resolved = view.resolve(section.path);
  if (!resolved.ok) return { reason: resolved.reason };
  const place = resolved.value;
  if (dangling(view, place)) return { reason: 'Not a text file' };
  switch (section.kind) {
    case 'add': { return add(place, section, record); }
    case 'delete': { return remove(place, record); }
    case 'update': { return update(place, section, record); }
  }
}

export function applySections(view: PatchView, sections: readonly PatchSection[]): ApplySectionsResult {
  const record: PatchRecord = { deletes: new Map(), writes: new Map() };
  for (const [index, section] of sections.entries()) {
    const failure = applyOne(view, section, record);
    if (failure) {
      const labels = { add: 'Add', delete: 'Delete', update: 'Update' };
      return { ok: false, section: index + 1, marker: `${labels[section.kind]} File: ${section.path}`, ...failure };
    }
  }
  return { ok: true, changes: buildPatchChanges(view, record), rows: patchRows(view.places()) };
}
