// One search term added to the tab's history, oldest first — the order the command bar's walk reads
// it in. Two decisions live here and nowhere else: a blank term is not a search and is not recorded,
// and a term is recorded once. Re-searching a term already in the list drops the earlier occurrence
// and appends the term, rather than leaving it where it was, because the walk answers ArrowUp with
// what was searched most recently and a second copy of the same term two positions down is noise to
// anyone stepping through it.
export function recordSearch(entries: readonly string[], term: string): string[] {
  const searched = term.trim();
  if (searched === '') return [...entries];
  return [...entries.filter((entry) => entry !== searched), searched];
}
