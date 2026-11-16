import { buildPatchChanges, type PatchChanges, type PatchRecord } from './changes.js';
import { applyHunks } from './hunks.js';
import { moveSection } from './moves.js';
import { createMoveRegistry } from './move-chains.js';
import type { PatchSection } from './parse.js';
import { patchRows, type PatchRow } from './rows.js';
import { checkText, followLink, freshContent, recordWrite, type SectionFailure } from './section-steps.js';
import type { PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

export type ApplySectionsResult =
  | { ok: true; changes: PatchChanges; rows: PatchRow[] }
  | { ok: false; section: number; marker: string; reason: string; hunkLine?: never }
  | { ok: false; section: number; marker: string; hunkLine: string; reason?: never };

function add(view: PatchView, place: PatchPlace, section: Extract<PatchSection, { kind: 'add' }>, record: PatchRecord): SectionFailure | undefined {
  if (place.exists) return { reason: 'File already exists' };
  const text = section.lines.length === 0 ? '' : `${section.lines.join('\n')}\n`;
  const error = checkText(text, false);
  if (error) return error;
  if (place.linkText !== undefined) {
    place.content = freshContent(place);
    place.linkText = undefined;
  }
  view.setExists(place, true);
  place.content.current = text;
  recordWrite(record, place, true);
  return undefined;
}

function remove(view: PatchView, place: PatchPlace, record: PatchRecord): SectionFailure | undefined {
  if (!place.exists) return { reason: 'File not found' };
  if (!record.deletes.has(place)) record.deletes.set(place, { place, linkText: place.linkText, content: place.content });
  record.removedByDelete.add(place);
  view.setExists(place, false);
  return undefined;
}

function update(place: PatchPlace, section: Extract<PatchSection, { kind: 'update' }>, record: PatchRecord): SectionFailure | undefined {
  if (!place.exists) return { reason: 'File not found' };
  const result = applyHunks(place.content.current ?? '', section.hunks);
  if (!result.ok) return { hunkLine: result.line };
  const fromAdd = record.writes.get(place.content)?.fromAdd ?? false;
  const error = checkText(result.text, place.content.hadBom && !fromAdd);
  if (error) return error;
  place.content.current = result.text;
  recordWrite(record, place, false);
  return undefined;
}

function applyOne(view: PatchView, section: PatchSection, record: PatchRecord): SectionFailure | undefined {
  const resolved = view.resolve(section.path);
  if (!resolved.ok) return { reason: resolved.reason };
  const place = resolved.value;
  const entryOnly = section.kind === 'delete' || (section.kind === 'update' && section.moveTo !== undefined && section.hunks.length === 0);
  const movedLink = place.linkText !== undefined && record.moves.byPlace.get(place)?.get(place.content)?.some((chain) => chain.link);
  const linkError = entryOnly && movedLink ? undefined : followLink(view, place, record);
  if (linkError) return { reason: linkError };
  switch (section.kind) {
    case 'add': { return add(view, place, section, record); }
    case 'delete': { return remove(view, place, record); }
    case 'update': { return section.moveTo === undefined ? update(place, section, record) : moveSection(view, place, section, record); }
  }
}

export function applySections(view: PatchView, sections: readonly PatchSection[]): ApplySectionsResult {
  const record: PatchRecord = { deletes: new Map(), writes: new Map(), moves: createMoveRegistry(), linkTargets: new Map(), removedByDelete: new Set() };
  for (const [index, section] of sections.entries()) {
    const failure = applyOne(view, section, record);
    if (failure) {
      const labels = { add: 'Add', delete: 'Delete', update: 'Update' };
      return { ok: false, section: index + 1, marker: `${labels[section.kind]} File: ${section.path}`, ...failure };
    }
  }
  return { ok: true, changes: buildPatchChanges(view, record), rows: patchRows(view.places(), record.moves.chains) };
}
