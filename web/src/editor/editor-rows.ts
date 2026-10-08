import type { SuggestHunk } from '@shared/protocol';
import type { SuggestDiffPreview } from './suggestDiff';
import { suggestDiffPreview } from './suggestDiff';

// One unresolved hunk's diff preview, paired with its index into `pending.hunks` so accept/decline
// clicks can name the right hunk.
type HunkPreview = { index: number; diff: SuggestDiffPreview };

// One row of the editor buffer's render plan: a buffer line as it stands, a buffer line a previewed
// hunk replaces (rendered removed), or a line the hunk adds. An added row names its hunk, its text,
// its position within that hunk's added lines (which is what the React key needs), and whether it is
// the hunk's last added line — the row that carries the accept/decline controls.
export type EditorRow =
  | { kind: 'buffer'; index: number }
  | { kind: 'removed'; index: number }
  | { kind: 'added'; hunkIndex: number; text: string; position: number; last: boolean };

// The ordered rows the buffer renders: every line, with each still-unresolved pending hunk's removed
// range and added lines interleaved at the hunk's position. Hunks whose anchor no longer matches
// (no preview) and hunks that overlap an earlier one are left out of the plan. `resolved` is
// parallel to `hunks` — true once that hunk has been accepted or declined, at which point it no
// longer previews.
export function buildEditorRows(lines: string[], hunks: SuggestHunk[], resolved: boolean[]): EditorRow[] {
  const previews: HunkPreview[] = hunks
    .map((hunk, index) => ({ index, diff: resolved.at(index) ? null : suggestDiffPreview(lines, hunk) }))
    .filter((p): p is HunkPreview => p.diff !== null)
    .toSorted((a, b) => a.diff.startLine - b.diff.startLine);

  const rows: EditorRow[] = [];
  let cursor = 0;
  for (const { index: hunkIndex, diff } of previews) {
    // A hunk whose range starts before the previous one finished overlaps it — skip previewing it
    // this render pass rather than draw conflicting rows (Design decision: no interval-conflict UI).
    if (diff.startLine < cursor) continue;
    for (let i = cursor; i < diff.startLine; i++) rows.push({ kind: 'buffer', index: i });
    const removedEnd = diff.startLine + diff.removedCount;
    for (let i = diff.startLine; i < removedEnd; i++) rows.push({ kind: 'removed', index: i });
    for (const [position, text] of diff.added.entries()) {
      rows.push({ kind: 'added', hunkIndex, text, position, last: position === diff.added.length - 1 });
    }
    cursor = removedEnd;
  }
  for (let i = cursor; i < lines.length; i++) rows.push({ kind: 'buffer', index: i });
  return rows;
}
