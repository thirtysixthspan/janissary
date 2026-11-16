import type { PatchRecord } from './changes.js';
import { applyHunks } from './hunks.js';
import { recordMove } from './move-chains.js';
import type { PatchSection } from './parse.js';
import { checkText, followLink, freshContent, recordWrite, type SectionFailure } from './section-steps.js';
import type { PatchPlace } from './view-entry.js';
import type { PatchView } from './view.js';

export function moveSection(view: PatchView, source: PatchPlace, section: Extract<PatchSection, { kind: 'update' }>, record: PatchRecord): SectionFailure | undefined {
  if (!source.exists) return { reason: 'File not found' };
  const result = section.hunks.length > 0 ? applyHunks(source.content.current ?? '', section.hunks) : { ok: true as const, text: source.content.current ?? '' };
  if (!result.ok) return { hunkLine: result.line };
  const resolved = view.resolve(section.moveTo ?? '');
  if (!resolved.ok) return { reason: resolved.reason };
  const target = resolved.value;
  if (followLink(view, target, record)) return { reason: 'Not a text file' };
  if (target.exists) return { reason: 'File already exists' };
  const fromAdd = record.writes.get(source.content)?.fromAdd ?? false;
  const error = checkText(result.text, source.content.hadBom && !fromAdd);
  if (error) return error;
  const replacedLink = record.deletes.get(source)?.linkText !== undefined && source.linkText === undefined;
  recordMove(record.chains, source, target, replacedLink);
  if (!record.deletes.has(source)) record.deletes.set(source, { place: source, linkText: source.linkText, content: source.content });
  if (section.hunks.length > 0) {
    source.content.current = result.text;
    recordWrite(record, source, false);
  }
  target.exists = true;
  target.linkText = source.linkText;
  target.content = source.content;
  const linkTarget = record.linkTargets.get(source);
  if (linkTarget !== undefined) record.linkTargets.set(target, linkTarget);
  source.exists = false;
  source.linkText = undefined;
  source.content = freshContent(source);
  return undefined;
}
