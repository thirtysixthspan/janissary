import type { SuggestHunk } from '@shared/protocol';

// Splice `hunk` into `text` at its anchor's first occurrence (empty anchor = append at the end),
// or return null when the anchor no longer matches (the hunk is simply dropped).
export function spliceHunk(text: string, hunk: SuggestHunk): string | null {
  const idx = hunk.anchor === '' ? text.length : text.indexOf(hunk.anchor);
  if (idx === -1) return null;
  return `${text.slice(0, idx)}${hunk.replacement}${text.slice(idx + hunk.anchor.length)}`;
}

export type SuggestDiffPreview = { startLine: number; removedCount: number; added: string[] };

// The contiguous run of lines `hunk` would change, as a common-prefix/common-suffix diff between
// the current buffer and the hypothetical post-apply text — enough to render an inline preview
// without diffing the whole file. Null when the anchor doesn't match (nothing to preview).
export function suggestDiffPreview(lines: string[], hunk: SuggestHunk): SuggestDiffPreview | null {
  const newText = spliceHunk(lines.join('\n'), hunk);
  if (newText === null) return null;
  const newLines = newText.split('\n');

  let prefix = 0;
  while (prefix < lines.length && prefix < newLines.length && lines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < lines.length - prefix && suffix < newLines.length - prefix &&
    lines[lines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++;

  return {
    startLine: prefix,
    removedCount: lines.length - prefix - suffix,
    added: newLines.slice(prefix, newLines.length - suffix),
  };
}
