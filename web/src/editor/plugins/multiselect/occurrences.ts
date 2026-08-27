// Literal occurrence search over the document as one string. Exact and case-sensitive, with no
// regex anywhere: the term is arbitrary text the user selected, so a constructed pattern would need
// escaping and would trip `security/detect-unsafe-regex` for nothing — indexOf is the whole need.

export type OffsetRange = { start: number; end: number };

// A match overlapping a range that is already selected is skipped rather than returned: two
// overlapping selections would each replace the same text on the next multi-caret edit, and the
// applier refuses such a set outright (see ../apply-edits.ts).
const overlapsTaken = (at: number, length: number, taken: readonly OffsetRange[]): boolean => (
  taken.some((range) => at < range.end && range.start < at + length)
);

// The next occurrence at or after `from`, continuing from the top of the document once the end is
// reached, or null when every occurrence is already taken (or there is none).
export function nextOccurrence(
  document: string, term: string, from: number, taken: readonly OffsetRange[],
): number | null {
  if (term === '') return null;
  const candidates: number[] = [];
  for (let at = document.indexOf(term, from); at !== -1; at = document.indexOf(term, at + 1)) candidates.push(at);
  for (let at = document.indexOf(term); at !== -1 && at < from; at = document.indexOf(term, at + 1)) candidates.push(at);
  return candidates.find((at) => !overlapsTaken(at, term.length, taken)) ?? null;
}
